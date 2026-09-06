// lib/db/production/moderation.js — THE QUEUE A HUMAN READS.
//
// Nothing here decides anything. A moderation task is a note left for a
// person: something in the catalog or a reader's correction needs a judgment
// that the code is not entitled to make. Tasks are opened by whatever noticed
// the problem (corrections, the Asterisk foundation) and closed only by a
// named human, whose id is recorded in `resolvedBy`.
//
// `createModerationTask` takes an optional queryTarget so a caller inside a
// transaction can open the task in the SAME transaction as the thing that
// caused it — a correction must never exist without its task.

import { randomUUID } from "crypto";

import { getPool } from "../index.js";
import { mem, push, boundedLimit } from "./store.js";

export function moderationTaskRow(t) {
  return {
    id: "mod-" + randomUUID(),
    kind: String(t.kind).slice(0, 40), subjectType: String(t.subjectType).slice(0, 40),
    subjectId: String(t.subjectId).slice(0, 80), payload: t.payload || {},
    priority: ["low", "normal", "high"].includes(t.priority) ? t.priority : "normal",
    status: "open", resolution: null, resolvedBy: null,
  };
}

const MODERATION_TASK_INSERT_SQL =
  `INSERT INTO moderation_tasks (id, kind, subject_type, subject_id, payload, priority)
   VALUES ($1,$2,$3,$4,$5,$6)`;

export async function insertModerationTask(target, row) {
  await target.query(MODERATION_TASK_INSERT_SQL,
    [row.id, row.kind, row.subjectType, row.subjectId, JSON.stringify(row.payload), row.priority]);
}

export async function createModerationTask(t, queryTarget = null) {
  const row = moderationTaskRow(t);
  const p = queryTarget || await getPool();
  if (!p) return push(mem.moderationTasks, { ...row, createdAt: Date.now(), persistent: false });
  await insertModerationTask(p, row);
  return { ...row, persistent: true };
}

export async function listModerationTasks({ status = "open", limit = 100 } = {}) {
  limit = boundedLimit(limit, 100, 500);
  const p = await getPool();
  if (!p) return mem.moderationTasks.filter((t) => !status || t.status === status).slice(-limit).reverse();
  const { rows } = await p.query(
    `SELECT * FROM moderation_tasks WHERE ($1::text IS NULL OR status=$1)
     ORDER BY created_at DESC LIMIT $2`, [status, limit]);
  return rows.map((r) => ({
    id: r.id, kind: r.kind, subjectType: r.subject_type, subjectId: r.subject_id,
    payload: r.payload || {}, priority: r.priority, status: r.status,
    resolution: r.resolution, resolvedBy: r.resolved_by,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function resolveModerationTask(id, { status = "resolved", resolution = null, resolvedBy = null } = {}) {
  if (!["resolved", "dismissed", "in_review"].includes(status)) return null;
  const p = await getPool();
  if (!p) {
    const t = mem.moderationTasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, { status, resolution, resolvedBy });
    return t;
  }
  const { rows } = await p.query(
    `UPDATE moderation_tasks SET status=$2, resolution=$3, resolved_by=$4, updated_at=now()
     WHERE id=$1 RETURNING id, status, resolution, resolved_by`, [id, status, resolution, resolvedBy]);
  return rows[0] || null;
}
