// lib/db/production/verification.js — THE VERIFICATION LEDGER'S ROWS (V.2
// brief §12, schema v61). SERVER-ONLY; memory mode mirrors it. Append-only:
// a check run is a new row; the LATEST row for the listing's CURRENT evidence
// version is what the badge reads (lib/verification/ledger.js badgeFor). v61
// may be unapplied where this runs — readers answer empty, writers refuse by
// name.

import { getPool, hasRelation } from "../core/pool.js";

const memRows = [];
let memSeq = 1;

const applied = async (p) => (p ? hasRelation(p, "listing_verifications") : true);

function rowOut(r) {
  return {
    id: String(r.id), itemId: r.item_id, evidenceVersion: r.evidence_version,
    source: { status: r.source_status, detail: r.source_detail || null },
    ai: { status: r.ai_status, confidence: r.ai_confidence == null ? null : Number(r.ai_confidence), model: r.ai_model || null, version: r.ai_version || null, detail: r.ai_detail || null },
    human: { status: r.human_status, reviewer: r.human_reviewer || null, at: r.human_at ? new Date(r.human_at).toISOString() : null },
    checkedAt: new Date(r.checked_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), rulesVersion: r.rules_version,
  };
}

/** Append one record (lib/verification/ledger.js buildRecord's shape). */
export async function recordVerification(rec) {
  const p = await getPool();
  if (!(await applied(p))) throw new Error("the verification ledger needs schema v61 applied");
  if (!p) {
    const row = { id: memSeq++, item_id: rec.itemId, evidence_version: rec.evidenceVersion, source_status: rec.source.status, source_detail: rec.source.detail, ai_status: rec.ai.status, ai_confidence: rec.ai.confidence, ai_model: rec.ai.model, ai_version: rec.ai.version, ai_detail: rec.ai.detail, human_status: rec.human.status, human_reviewer: rec.human.reviewer, human_at: rec.human.at, checked_at: rec.checkedAt, expires_at: rec.expiresAt, rules_version: rec.rulesVersion };
    memRows.push(row);
    return rowOut(row);
  }
  const { rows } = await p.query(
    `INSERT INTO listing_verifications (item_id, evidence_version, source_status, source_detail, ai_status, ai_confidence, ai_model, ai_version, ai_detail, human_status, human_reviewer, human_at, checked_at, expires_at, rules_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [rec.itemId, rec.evidenceVersion, rec.source.status, rec.source.detail, rec.ai.status, rec.ai.confidence, rec.ai.model, rec.ai.version, rec.ai.detail, rec.human.status, rec.human.reviewer, rec.human.at, rec.checkedAt, rec.expiresAt, rec.rulesVersion]);
  return rowOut(rows[0]);
}

/** The latest record per item, for a list of ids → Map(itemId → record). */
export async function latestVerifications(itemIds = []) {
  const ids = [...new Set(itemIds.map(String).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const p = await getPool();
  if (!(await applied(p))) return out;
  if (!p) {
    for (const r of memRows) if (ids.includes(r.item_id)) { const cur = out.get(r.item_id); if (!cur || r.id > Number(cur.id)) out.set(r.item_id, rowOut(r)); }
    return out;
  }
  const { rows } = await p.query(
    `SELECT DISTINCT ON (item_id) * FROM listing_verifications WHERE item_id = ANY($1::text[]) ORDER BY item_id, checked_at DESC, id DESC`, [ids]);
  for (const r of rows) out.set(r.item_id, rowOut(r));
  return out;
}

/** Test seam. */
export function resetMemoryVerifications() { memRows.length = 0; memSeq = 1; }
