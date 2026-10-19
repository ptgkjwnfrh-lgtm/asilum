// lib/db/production/booths.js — WHO GETS TO SELL HERE.
//
// Two layers of one program, split out of production.js unchanged:
//
//   business accounts (v26) an account's CURRENT standing — passport or
//                           business. There is no machine path from one to the
//                           other: the trust decision is a human-reviewed
//                           brand_cases verification case, and this table only
//                           records what that case decided.
//   the hotlist (P2-P4)     membership and rent, riding on that standing. The
//                           rent ledger is append-only and written by the admin
//                           desk; this is the state of a manual first cohort,
//                           not a billing engine.
//
// A booth is PLACEABLE only while all three hold — member, rent paid through
// today, source linked — which is why placement is computed from the ledger on
// read rather than stored as a flag somebody has to remember to clear.

import { getPool } from "../index.js";
import { validateOpenCase, validateTransition } from "../../brands/cases.js";
import { mem } from "./store.js";
import { createModerationTask } from "./moderation.js";
import { applyBrandCaseTransition, getBrandCase, insertBrandCase } from "./interpretation.js";

// ---- business accounts (v26; owner law, Aug 13) --------------------------
// A PASSPORT account becomes a BUSINESS account through a human-reviewed
// brand_cases verification case — the case machine is the trust decision
// (no machine path to business), this table is the account's current
// state and the booth roster's fast read. One row per account; history
// lives in the linked case + its events.

function businessRow(r) {
  return {
    accountId: r.account_id, brandName: r.brand_name, websiteUrl: r.website_url,
    shopifyDomain: r.shopify_domain, statement: r.statement, status: r.status,
    caseId: r.case_id, reviewNote: r.review_note,
    sourceName: r.source_name || null,
    hotlistMember: Boolean(r.hotlist_member),
    hotlistPaidThrough: r.hotlist_paid_through
      ? String(r.hotlist_paid_through).slice(0, 10) : null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).getTime() : null,
    decidedAt: r.decided_at ? new Date(r.decided_at).getTime() : null,
    persistent: true,
  };
}

// The inventory link (v32): a VERIFIED business claims its source slug —
// the same namespace items carry — exactly once. UNIQUE index (pg) / scan
// (mem) refuses a slug another business holds.
export async function setBusinessSourceName(accountId, sourceName) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (row.status !== "business") throw new Error("only a verified business links inventory");
  const p = await getPool();
  if (!p) {
    for (const [otherId, other] of mem.businessAccounts) {
      if (otherId !== accountId && other.sourceName === sourceName) {
        throw new Error("source name already linked to another business");
      }
    }
    const next = { ...mem.businessAccounts.get(accountId), sourceName };
    mem.businessAccounts.set(accountId, next);
    return { ...next };
  }
  try {
    const { rows } = await p.query(
      `UPDATE business_accounts SET source_name=$2, updated_at=now()
       WHERE account_id=$1 AND status='business' RETURNING *`,
      [accountId, sourceName]);
    if (!rows[0]) throw new Error("only a verified business links inventory");
    return businessRow(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") throw new Error("source name already linked to another business");
    throw err;
  }
}

// Duplicate-brand screen (gap 2, 18 Aug): normalized-exact and near
// (levenshtein ≤ 2, names ≥ 5 chars — short names near-match everything)
// collisions against every non-rejected application and verified business.
// A FLAG for the reviewer, never a refusal: the reviewer decides which of
// two claimants is the brand. The applicant is told nothing — "that name is
// taken" would leak who applied and teach an impersonator how to probe.
export function normalizeBrandName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function findBrandNameCollisions(brandName, excludeAccountId = null) {
  const { distance } = await import("fastest-levenshtein");
  const norm = normalizeBrandName(brandName);
  if (!norm) return [];
  const p = await getPool();
  let rows;
  if (!p) {
    rows = [...mem.businessAccounts.values()].map((r) => ({
      accountId: r.accountId, brandName: r.brandName, status: r.status,
    }));
  } else {
    const r = await p.query(
      `SELECT account_id, brand_name, status FROM business_accounts
       WHERE status <> 'rejected' LIMIT 5000`);
    rows = r.rows.map((x) => ({ accountId: x.account_id, brandName: x.brand_name, status: x.status }));
  }
  const hits = [];
  for (const row of rows) {
    if (row.status === "rejected") continue;
    if (excludeAccountId && row.accountId === excludeAccountId) continue;
    const other = normalizeBrandName(row.brandName);
    if (!other) continue;
    const exact = other === norm;
    const near = !exact && norm.length >= 5 && other.length >= 5 && distance(norm, other) <= 2;
    if (exact || near) {
      hits.push({ accountId: row.accountId, brandName: row.brandName, status: row.status, match: exact ? "exact" : "near" });
    }
  }
  return hits;
}

// Public impersonation report (gap 1, 18 Aug): opens a REAL v18 case in the
// impersonation track and files the moderation task a human works through.
// The reporter is a named opener on the ledger; evidence URLs are https-only
// by the case validator. Adjudication (upheld/dismissed/enforced) stays
// entirely human — this only opens the door.
export async function openImpersonationReport({ reporterAccountId, brandName, subjectType = "brand", subjectId, evidenceUrls, note }) {
  const opened = await insertBrandCase(validateOpenCase({
    kind: "impersonation",
    brandName,
    subjectType,
    subjectId: subjectId || normalizeBrandName(brandName).slice(0, 80) || "unnamed",
    openedBy: "account:" + reporterAccountId,
    evidence: { urls: evidenceUrls, note },
  }));
  const t = validateTransition(opened, { to: "under_review", actor: "account:" + reporterAccountId });
  await applyBrandCaseTransition(opened.id, "open", t);
  await createModerationTask({
    kind: "impersonation-report",
    subjectType: "brand_case",
    subjectId: opened.id,
    payload: { brandName, reporter: reporterAccountId },
    priority: 2,
  });
  return { caseId: opened.id };
}

export async function getBusinessBySourceName(sourceName) {
  if (!sourceName) return null;
  const p = await getPool();
  if (!p) {
    for (const row of mem.businessAccounts.values()) {
      if (row.sourceName === sourceName) return { ...row };
    }
    return null;
  }
  const { rows } = await p.query("SELECT * FROM business_accounts WHERE source_name=$1", [sourceName]);
  return rows[0] ? businessRow(rows[0]) : null;
}

export async function getBusinessAccount(accountId) {
  const p = await getPool();
  if (!p) {
    const row = mem.businessAccounts.get(accountId);
    return row ? { ...row } : null;
  }
  const { rows } = await p.query("SELECT * FROM business_accounts WHERE account_id=$1", [accountId]);
  return rows[0] ? businessRow(rows[0]) : null;
}

// Submit (or resubmit) the application. A verified business never
// downgrades here — resubmitting while status='business' throws; while
// under review it refreshes the fields on the same case; after a
// rejection it opens a FRESH verification case (the old one stays in
// the ledger) and returns to review.
export async function submitBusinessApplication({ accountId, brandName, websiteUrl, shopifyDomain, statement }) {
  const existing = await getBusinessAccount(accountId);
  if (existing && existing.status === "business") {
    throw new Error("already a business account");
  }
  let caseId = existing && existing.status === "under_review" ? existing.caseId : null;
  if (!caseId) {
    const opened = await insertBrandCase(validateOpenCase({
      kind: "verification", brandName, openedBy: "account:" + accountId,
      subjectType: "profile_room", subjectId: accountId,
      evidence: { urls: [websiteUrl, "https://" + shopifyDomain], note: "business-account application" },
    }));
    const t = validateTransition(opened, { to: "under_review", actor: "account:" + accountId });
    await applyBrandCaseTransition(opened.id, "open", t);
    caseId = opened.id;
  }
  const now = Date.now();
  const p = await getPool();
  if (!p) {
    const row = {
      accountId, brandName, websiteUrl, shopifyDomain,
      statement: statement || null, status: "under_review", caseId,
      reviewNote: null, submittedAt: existing?.submittedAt || now,
      decidedAt: null, persistent: false,
    };
    mem.businessAccounts.set(accountId, row);
    return { ...row };
  }
  const { rows } = await p.query(
    `INSERT INTO business_accounts (account_id, brand_name, website_url, shopify_domain, statement, status, case_id)
     VALUES ($1,$2,$3,$4,$5,'under_review',$6)
     ON CONFLICT (account_id) DO UPDATE SET
       brand_name=$2, website_url=$3, shopify_domain=$4, statement=$5,
       status='under_review', case_id=$6, review_note=NULL, decided_at=NULL,
       updated_at=now()
     RETURNING *`,
    [accountId, brandName, websiteUrl, shopifyDomain, statement || null, caseId]);
  return businessRow(rows[0]);
}

// The human decision: drives the linked case under_review → verified |
// rejected (CAS-guarded, evidence enforced by the machine), then lands
// the account state. If a prior decide moved the case but failed before
// the row update, re-deciding completes idempotently instead of
// double-moving.
export async function decideBusinessApplication({ accountId, approve, note, actor }) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no application for that account");
  if (row.status !== "under_review") throw new Error("application is not under review");
  const kase = await getBrandCase(row.caseId);
  if (!kase) throw new Error("application case missing");
  const target = approve ? "verified" : "rejected";
  if (kase.status === "under_review") {
    const t = validateTransition(kase, {
      to: target, actor, note: note || null,
      evidence: approve ? kase.evidence : undefined,
    });
    await applyBrandCaseTransition(kase.id, "under_review", t);
  } else if (kase.status !== target) {
    throw new Error("case is not under review");
  }
  const status = approve ? "business" : "rejected";
  const now = Date.now();
  const p = await getPool();
  if (!p) {
    const next = { ...row, status, reviewNote: note || null, decidedAt: now };
    mem.businessAccounts.set(accountId, next);
    return { ...next };
  }
  const { rows } = await p.query(
    `UPDATE business_accounts
     SET status=$2, review_note=$3, decided_at=now(), updated_at=now()
     WHERE account_id=$1 RETURNING *`,
    [accountId, status, note || null]);
  return businessRow(rows[0]);
}

// The booth roster: verified businesses in verification order — first
// verified, first booth. Public callers strip account ids.
export async function listVerifiedBusinesses(limit = 10) {
  const cap = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 10));
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => r.status === "business")
      .sort((a, b) => (a.decidedAt || 0) - (b.decidedAt || 0))
      .slice(0, cap).map((r) => ({ ...r }));
  }
  const { rows } = await p.query(
    "SELECT * FROM business_accounts WHERE status='business' ORDER BY decided_at ASC LIMIT $1",
    [cap]);
  return rows.map(businessRow);
}

// ---- The hotlist program (P2–P4, owner build order 20 Aug 2026) ------------
// Membership + rent-paid-through ride business_accounts (v36); rent payments
// are an append-only ledger the admin desk writes (P3 is MANUAL first
// cohort — these functions are its state, not a billing engine). A booth is
// PLACEABLE while member && paid_through covers today && a source is linked.

function addOneMonthUTC(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + 1, d));
  return next.toISOString().slice(0, 10);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function programState(row) {
  const paidThrough = row.hotlistPaidThrough || null;
  return {
    member: Boolean(row.hotlistMember),
    paidThrough,
    active: Boolean(row.hotlistMember && paidThrough && paidThrough >= todayUTC()),
  };
}

export async function hotlistProgramState(accountId) {
  const row = await getBusinessAccount(accountId);
  if (!row) return null;
  return programState(row);
}

export async function setHotlistMembership(accountId, member) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (member && row.status !== "business") throw new Error("only a verified business can enroll");
  const p = await getPool();
  if (!p) {
    const next = { ...mem.businessAccounts.get(accountId), hotlistMember: Boolean(member) };
    mem.businessAccounts.set(accountId, next);
    return programState(next);
  }
  const { rows } = await p.query(
    `UPDATE business_accounts SET hotlist_member=$2, updated_at=now()
     WHERE account_id=$1 RETURNING hotlist_member, hotlist_paid_through`,
    [accountId, Boolean(member)]
  );
  return programState({
    hotlistMember: rows[0].hotlist_member,
    hotlistPaidThrough: rows[0].hotlist_paid_through
      ? String(rows[0].hotlist_paid_through).slice(0, 10) : null,
  });
}

// One rent payment = one month of coverage, in advance, appended to the
// ledger. Coverage extends from max(today, current paid-through).
export async function recordHotlistRent(accountId, { amountCents, actor = null, note = null }) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (!row.hotlistMember) throw new Error("not enrolled in the hotlist program");
  const cents = Math.trunc(Number(amountCents));
  if (!(cents > 0)) throw new Error("amount_cents must be positive");
  const today = todayUTC();
  const start = row.hotlistPaidThrough && row.hotlistPaidThrough >= today
    ? row.hotlistPaidThrough
    : today;
  const end = addOneMonthUTC(start);
  const p = await getPool();
  if (!p) {
    mem.hotlistRent = mem.hotlistRent || [];
    mem.hotlistRent.push({
      accountId, amountCents: cents, periodStart: start, periodEnd: end,
      actor, note, at: Date.now(),
    });
    const next = { ...mem.businessAccounts.get(accountId), hotlistPaidThrough: end };
    mem.businessAccounts.set(accountId, next);
    return { ...programState(next), periodStart: start, periodEnd: end };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO hotlist_rent_payments (account_id, amount_cents, period_start, period_end, actor, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [accountId, cents, start, end, actor, note]
    );
    const { rows } = await client.query(
      `UPDATE business_accounts SET hotlist_paid_through=$2, updated_at=now()
       WHERE account_id=$1 RETURNING hotlist_member, hotlist_paid_through`,
      [accountId, end]
    );
    await client.query("COMMIT");
    return {
      ...programState({
        hotlistMember: rows[0].hotlist_member,
        hotlistPaidThrough: String(rows[0].hotlist_paid_through).slice(0, 10),
      }),
      periodStart: start,
      periodEnd: end,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Placeable paid booths: enrolled, rent covering today, inventory linked.
// Below-floor taste matches are filtered by the CALLER (lib/hotlist.js) —
// this is the money/state gate only.
export async function listPaidBooths() {
  const today = todayUTC();
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => r.status === "business" && r.hotlistMember &&
        r.hotlistPaidThrough && r.hotlistPaidThrough >= today && r.sourceName)
      .map((r) => ({
        brandName: r.brandName, websiteUrl: r.websiteUrl,
        sourceName: r.sourceName, paidThrough: r.hotlistPaidThrough,
      }));
  }
  const { rows } = await p.query(
    `SELECT brand_name, website_url, source_name, hotlist_paid_through
     FROM business_accounts
     WHERE status='business' AND hotlist_member
       AND hotlist_paid_through >= CURRENT_DATE AND source_name IS NOT NULL
     ORDER BY decided_at ASC LIMIT 10`
  );
  return rows.map((r) => ({
    brandName: r.brand_name, websiteUrl: r.website_url,
    sourceName: r.source_name, paidThrough: String(r.hotlist_paid_through).slice(0, 10),
  }));
}

export async function listBusinessApplications({ status = "under_review", limit = 50 } = {}) {
  const cap = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .slice(0, cap).map((r) => ({ ...r }));
  }
  const { rows } = await p.query(
    `SELECT * FROM business_accounts WHERE ($1::text IS NULL OR status=$1)
     ORDER BY submitted_at DESC LIMIT $2`,
    [status, cap]);
  return rows.map(businessRow);
}

export async function listBrandCaseEvents(caseId, limit = 100) {
  const cap = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 100));
  const p = await getPool();
  if (!p) {
    return mem.brandCaseEvents.filter((e) => e.caseId === caseId).slice(-cap);
  }
  const { rows } = await p.query(
    `SELECT case_id, from_status, to_status, actor, note, at
     FROM (
       SELECT id, case_id, from_status, to_status, actor, note, at
       FROM brand_case_events
       WHERE case_id=$1
       ORDER BY at DESC, id DESC
       LIMIT $2
     ) AS recent
     ORDER BY at, id`,
    [caseId, cap]);
  return rows.map((r) => ({
    caseId: r.case_id, fromStatus: r.from_status, toStatus: r.to_status,
    actor: r.actor, note: r.note, at: r.at,
  }));
}
