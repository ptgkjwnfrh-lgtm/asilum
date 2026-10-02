// lib/verification/run.js — RUN THE CHECKS on one listing and append the
// row (V.2 brief §12). SERVER-ONLY. The route and the script both call this;
// a Next route file may export only handlers, so it lives here.
import { recordVerification } from "../db/production/verification.js";
import { aiCheckFromComparison, buildRecord, sourceCheck } from "./ledger.js";
import { compareItem } from "./desk.js";

/** Source + AI (local rules, model off) checks; an optional reviewer's word rides along. */
export async function runChecks(item, { human = null, reviewer = null, now = Date.now() } = {}) {
  const source = sourceCheck(item);
  const ai = aiCheckFromComparison(compareItem(item));
  const rec = buildRecord(item, { source, ai, human: human ? { status: human, reviewer, at: new Date(now).toISOString() } : null, now });
  return recordVerification(rec);
}
