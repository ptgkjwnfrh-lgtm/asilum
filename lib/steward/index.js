// lib/steward/index.js — the Asterisk steward: one pass over the live machine.
//
// The owner's standing question is "is anything wrong?", and the honest answer
// has always been spread across a dozen commands and two handovers. This runs
// the checks in one go, ranks what it finds worst-first, and says what a person
// would do about each one.
//
// THREE RULES, and they are the whole design:
//
//   1. IT ONLY READS. No writes, no migrations, no deletions, no external
//      calls. Every action it recommends is for a person at the admin desk.
//   2. A CHECK THAT THROWS IS NOT A CHECK THAT PASSED. Any error becomes an
//      `unmeasurable` finding carrying the error's own words, ranked above ok.
//      One broken check can never take the report down with it, and can never
//      be mistaken for silence.
//   3. THE REPORT IS DATA. `runSteward` returns a structure; printing is the
//      caller's job (scripts/steward.mjs prints, the admin desk renders).
//      Nothing here knows what a terminal is.

import { CHECKS, STATES, stateRank } from "./checks.js";

export { CHECKS, STATES } from "./checks.js";

/** Which states mean "a person should look at this now". */
export const ATTENTION = Object.freeze(["blocker", "warn", "unmeasurable"]);

/**
 * Run every check (or a named subset) against a context.
 * ctx: { query?, schemaVersions?, now? } — `query` is any (sql) => {rows}.
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

/** The schema versions the repo carries, for the ledger check. */
export function schemaVersionsFrom(filenames = []) {
  return filenames
    .map((f) => /schema-v(\d+)\.sql$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}
