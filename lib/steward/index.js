// lib/steward/index.js — the Asterisk steward: one pass over the live machine,
// and — since 3 September 2026 — hands to act on what it finds.
//
// The owner's standing question is "is anything wrong?", and the honest answer
// has always been spread across a dozen commands and two handovers. This runs
// the checks in one go, ranks what it finds worst-first, says what a person
// would do about each one — and, inside a declared boundary, does it.
//
// THE RULES, and they are the whole design:
//
//   1. THE CHECKS ONLY READ. A finding is never produced by a write. What the
//      steward may DO about a finding lives in actions.js, and whether it MAY
//      do it lives in decisions.js — three tiers: delegated, confirm, never.
//      The owner set the constitution's read-only rule aside for this on
//      3 Sep 2026; two rails did not move: no faking, and a hard stop before
//      anything irreversible. Both are written into the boundary by name.
//   2. A CHECK THAT THROWS IS NOT A CHECK THAT PASSED. Any error becomes an
//      `unmeasurable` finding carrying the error's own words, ranked above ok.
//      One broken check can never take the report down with it, and can never
//      be mistaken for silence.
//   3. THE REPORT IS DATA. `runSteward` returns a structure; printing is the
//      caller's job (scripts/steward.mjs prints, the admin desk renders).
//      Nothing here knows what a terminal is.
//   4. THE LEDGER ROW GOES FIRST. Every repair is one transaction: the
//      steward_actions row is inserted, THEN the mutation runs on the same
//      connection. If the mutation touches a different number of rows than
//      the plan named, the whole transaction rolls back — the world moved
//      between plan and act, and a row claiming N when M happened must not
//      stand. A revert is the same shape with a 'reverted' row.
//   5. A PLAN IS A READ. `planRepairs` names exactly what the hands would
//      touch and can be shown to anyone without touching it. `--act` is the
//      only thing that turns a plan into a write.

import { randomUUID } from "node:crypto";
import { CHECKS, STATES, stateRank } from "./checks.js";
import { actionsForCheck, actionFor } from "./actions.js";
import { boundaryFor, permitted } from "./decisions.js";

export { CHECKS, STATES } from "./checks.js";
export { ACTIONS } from "./actions.js";
export { BOUNDARY, NEVER_DELEGATED, TIERS } from "./decisions.js";

/** Which states mean "a person should look at this now". */
export const ATTENTION = Object.freeze(["blocker", "warn", "unmeasurable"]);

/** A finding in one of these states has nothing for the hands to do. */
const QUIET = new Set(["ok", "unmeasurable"]);

/**
 * Run every check (or a named subset) against a context.
 * ctx: { query?, schemaVersions?, now? } — `query` is any (sql, params) => {rows}.
 * Returns { findings, summary, attention, ranAt }.
 */
export async function runSteward(ctx = {}, { only = null } = {}) {
  const list = only ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
  const findings = [];
  for (const check of list) {
    const base = { id: check.id, title: check.title, area: check.area };
    try {
      const result = await check.run(ctx);
      const state = STATES.includes(result?.state) ? result.state : "unmeasurable";
      findings.push({
        ...base,
        state,
        evidence: result?.evidence || "the check returned no evidence",
        detail: result?.detail || null,
        action: result?.action || null,
      });
    } catch (err) {
      // Rule 2. The message is the evidence — a check that failed on a missing
      // column says so, instead of being indistinguishable from a clean pass.
      findings.push({
        ...base,
        state: "unmeasurable",
        evidence: `the check could not run: ${err?.message || String(err)}`,
        detail: null,
        action: "the steward reports what it cannot see; this one needs a person.",
      });
    }
  }
  findings.sort((a, b) => stateRank(a.state) - stateRank(b.state) || a.id.localeCompare(b.id));

  const summary = Object.fromEntries(STATES.map((s) => [s, findings.filter((f) => f.state === s).length]));
  return {
    findings,
    summary,
    attention: findings.filter((f) => ATTENTION.includes(f.state)),
    ranAt: ctx.now || null,
  };
}

/**
 * Exit code contract, so a cron or CI job can use this without parsing prose:
 *   0 — nothing needs a person
 *   1 — at least one blocker
 *   2 — no blocker, but something is warn or unmeasurable
 */
export function exitCodeFor(report) {
  if (report.summary.blocker) return 1;
  if (report.summary.warn || report.summary.unmeasurable) return 2;
  return 0;
}

/**
 * The schema versions the repo carries, for the ledger check.
 *
 * Every migration since v5 is NAMED — `schema-v49-tag-facets.sql` — and the
 * first version of this pattern matched only the bare `schema-vN.sql`, so of
 * forty-odd files it saw one (v2) and the ledger check compared the database
 * against nothing for the whole life of the steward. v49 was merged, applied
 * to nothing, and reported "ok at v48". A matcher that matches nothing passes
 * everything; tests/steward-hands.test.js anchors this one on the real
 * directory.
 */
export function schemaVersionsFrom(filenames = []) {
  return filenames
    .map((f) => /^schema-v(\d+)(?:[-.].*)?\.sql$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// THE HANDS
// ---------------------------------------------------------------------------

/**
 * Wrap a pg pool so the runner can hold one connection across a ledger row
 * and its mutation. `transact(fn)` → BEGIN, fn(q), COMMIT; any throw → ROLLBACK
 * and the throw propagates. Tests pass their own `transact`.
 */
export function transactorFor(pool) {
  if (!pool) return null;
  return async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}

/**
 * For every finding that is neither ok nor unmeasurable, ask each action
 * bound to its check what it would do. READS ONLY. Returns one plan per
 * action with something to do, worst finding first, each carrying its tier so
 * a caller can show "would do" next to "may do".
 */
export async function planRepairs(ctx, report) {
  if (!ctx?.query) return [];
  const plans = [];
  for (const finding of report.findings) {
    if (QUIET.has(finding.state)) continue;
    for (const action of actionsForCheck(finding.id)) {
      const b = boundaryFor(action.id);
      if (!b || b.tier === "never") continue;
      try {
        const plan = await action.plan(ctx.query, finding, b.cap);
        if (!plan || !plan.count) continue;
        plans.push({ actionId: action.id, checkId: finding.id, title: action.title, tier: b.tier, cap: b.cap, ...plan });
      } catch (err) {
        plans.push({
          actionId: action.id, checkId: finding.id, title: action.title, tier: b.tier, cap: b.cap,
          count: 0, targets: [], inverse: [], error: `could not plan: ${err?.message || String(err)}`,
          evidence: "the plan could not be read; nothing will be done",
        });
      }
    }
  }
  return plans;
}

const INSERT_ACTION = `insert into steward_actions
  (id, run_id, action_id, check_id, tier, state, actor, count, targets, inverse, evidence, reverts)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)`;

const INSERT_RUN = `insert into steward_runs
  (id, fired_by, mode, actor, summary, findings, exit_code, instruments)
  values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb)`;

/** Rule 4 in one place: the row, then the mutation, then the count check. */
async function ledgered(transact, row, mutate) {
  return transact(async (q) => {
    await q(INSERT_ACTION, [
      row.id, row.runId, row.actionId, row.checkId, row.tier, row.state, row.actor,
      row.count, JSON.stringify(row.targets), JSON.stringify(row.inverse), row.evidence, row.reverts,
    ]);
    const { count } = await mutate(q);
    if (count !== row.count) {
      throw new Error(`the world moved between plan and act: planned ${row.count}, would have touched ${count} — rolled back, nothing done`);
    }
    return { count };
  });
}

/**
 * Read the board, plan the repairs, and make the ones this call is allowed
 * to make. Never throws for a repair that fails — each one reports its own
 * outcome. Returns { report, plans, acts, runId, hands }.
 *
 * opts: only, confirm (action ids a person said yes to for this run), dryRun,
 *       actor, firedBy ('cli'|'cron'|'desk'|'actions'), instruments (a result
 *       of runInstruments, recorded on the run row when present).
 */
export async function actSteward(ctx = {}, opts = {}) {
  const { only = null, confirm = [], dryRun = false, actor = "steward", firedBy = "cli", instruments = null } = opts;
  const report = await runSteward(ctx, { only });
  const plans = await planRepairs(ctx, report);
  const out = { report, plans, acts: [], runId: null, hands: null };

  if (!ctx.query || !ctx.transact) {
    out.hands = "no database — the hands have nothing to act on";
    return out;
  }
  if (dryRun) {
    out.hands = plans.length ? `dry run — ${plans.length} plan(s), nothing done` : "dry run — nothing to do";
    return out;
  }

  // The run row is written before any action, so every action row can name
  // the run it belongs to. The board and its exit code are known by now.
  out.runId = randomUUID();
  await ctx.transact((q) => q(INSERT_RUN, [
    out.runId, firedBy, "act", actor, JSON.stringify(report.summary), JSON.stringify(report.findings),
    exitCodeFor(report), instruments ? JSON.stringify(instruments) : null,
  ]));

  for (const plan of plans) {
    const gate = permitted(plan.actionId, { confirm });
    if (plan.error) { out.acts.push({ actionId: plan.actionId, state: "failed", count: 0, why: plan.error }); continue; }
    if (!gate.ok) {
      out.acts.push({ actionId: plan.actionId, state: gate.awaiting ? "awaiting-confirmation" : "refused", count: 0, why: gate.why });
      continue;
    }
    const action = actionFor(plan.actionId);
    const row = {
      id: randomUUID(), runId: out.runId, actionId: plan.actionId, checkId: plan.checkId, tier: plan.tier,
      state: "applied", actor, count: plan.count, targets: plan.targets, inverse: plan.inverse,
      evidence: plan.evidence, reverts: null,
    };
    try {
      await ledgered(ctx.transact, row, (q) => action.apply(q, plan, { actor }));
      out.acts.push({ actionId: plan.actionId, state: "applied", count: plan.count, ledgerId: row.id, evidence: plan.evidence });
    } catch (err) {
      out.acts.push({ actionId: plan.actionId, state: "failed", count: 0, why: err?.message || String(err) });
    }
  }

  const applied = out.acts.filter((a) => a.state === "applied").length;
  const waiting = out.acts.filter((a) => a.state === "awaiting-confirmation").length;
  out.hands = plans.length
    ? `${applied} repair(s) made${waiting ? `, ${waiting} awaiting a person's yes` : ""}${out.acts.some((a) => a.state === "failed") ? ", some failed (see acts)" : ""}`
    : "nothing to do";
  return out;
}

/**
 * Undo one applied action by its ledger id. A 'reverted' row goes first; the
 * inverse runs on the same connection; the count must match. Refuses a row
 * that is not 'applied', or that a 'reverted' row already names.
 */
export async function revertAction(ctx, id, { actor = "steward" } = {}) {
  if (!ctx?.query || !ctx?.transact) return { ok: false, why: "no database" };
  const { rows } = await ctx.query(
    `select a.*, exists (select 1 from steward_actions r where r.reverts = a.id) as reverted
       from steward_actions a where a.id = $1`, [id]);
  const original = rows[0];
  if (!original) return { ok: false, why: `no ledger row ${id}` };
  if (original.state !== "applied") return { ok: false, why: `row ${id} is a ${original.state} row, not an applied action` };
  if (original.reverted) return { ok: false, why: `row ${id} was already reverted` };
  const action = actionFor(original.action_id);
  if (!action) return { ok: false, why: `no action implements ${original.action_id} any more` };
  const inverse = Array.isArray(original.inverse) ? original.inverse : JSON.parse(original.inverse || "[]");
  const row = {
    id: randomUUID(), runId: null, actionId: original.action_id, checkId: original.check_id, tier: original.tier,
    state: "reverted", actor, count: inverse.length, targets: inverse, inverse: [],
    evidence: `revert of ${id}: ${original.evidence}`, reverts: id,
  };
  try {
    await ledgered(ctx.transact, row, (q) => action.revert(q, inverse));
    return { ok: true, ledgerId: row.id, count: inverse.length, actionId: original.action_id };
  } catch (err) {
    return { ok: false, why: err?.message || String(err) };
  }
}

/** The last `limit` ledger rows, newest first, each saying whether it stands. */
export async function readLedger(ctx, { limit = 20 } = {}) {
  if (!ctx?.query) return [];
  const { rows } = await ctx.query(
    `select a.id, a.run_id, a.at, a.action_id, a.check_id, a.tier, a.state, a.actor, a.count, a.evidence, a.reverts,
            exists (select 1 from steward_actions r where r.reverts = a.id) as reverted
       from steward_actions a
      order by a.at desc
      limit $1`, [Math.max(1, Math.min(200, Number(limit) || 20))]);
  return rows.map((r) => ({
    id: r.id, runId: r.run_id, at: r.at, actionId: r.action_id, checkId: r.check_id, tier: r.tier,
    state: r.state, actor: r.actor, count: Number(r.count), evidence: r.evidence, reverts: r.reverts,
    reverted: !!r.reverted,
  }));
}

/** The most recent run that recorded instruments, for movement. */
export async function lastInstrumentRun(ctx) {
  if (!ctx?.query) return null;
  const { rows } = await ctx.query(
    "select ran_at, instruments from steward_runs where instruments is not null order by ran_at desc limit 1");
  if (!rows[0]) return null;
  const inst = typeof rows[0].instruments === "string" ? JSON.parse(rows[0].instruments) : rows[0].instruments;
  return { ranAt: rows[0].ran_at, ...inst };
}

/** Record a read-only run (the schedule does this so movement has a history). */
export async function recordRun(ctx, report, { actor = "steward", firedBy = "cli", instruments = null } = {}) {
  if (!ctx?.transact) return null;
  const id = randomUUID();
  await ctx.transact((q) => q(INSERT_RUN, [
    id, firedBy, "read", actor, JSON.stringify(report.summary), JSON.stringify(report.findings),
    exitCodeFor(report), instruments ? JSON.stringify(instruments) : null,
  ]));
  return id;
}
