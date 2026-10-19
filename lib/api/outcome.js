// lib/api/outcome.js — the typed outcome every V.2 route in the engine lane
// returns (docs/v2/CONTRACTS.md § Common behavior).
//
// WHY. Before 19 Sep 2026 `/api/search` caught an engine throw and answered
// `{ results: [], total: 0 }` with HTTP 200, and `/api/tickets` answered a
// Postgres outage with `{ tickets: [] }` — a reader could not tell "you have
// nothing" from "the desk is down". Empty and unavailable are different
// statements and get different outcomes, different status codes and, on the
// failure side, a retryable flag the client can act on.
//
// Pure module: no next/server import, so node tests can load it (trap 171).

import { randomUUID } from "node:crypto";

export const API_CONTRACT_VERSION = 1;

export const OUTCOMES = Object.freeze([
  "ok", "empty", "unavailable", "unauthorized", "invalid", "stale_cursor", "rate_limited", "not_found",
]);

const STATUS = Object.freeze({
  unavailable: 503, unauthorized: 401, invalid: 400, stale_cursor: 409, rate_limited: 429, not_found: 404,
});

export function newRequestId() {
  return randomUUID();
}

/** "ok" when the page carries anything, "empty" when a successful read found nothing. */
export function outcomeOf(count) {
  return Number(count) > 0 ? "ok" : "empty";
}

/**
 * The success envelope fields, to spread into an existing response body.
 * Additive on purpose: `results / interpreted / note / total` and every older
 * field stay exactly where the shell already reads them.
 */
export function envelope({ count, requestId = newRequestId() } = {}) {
  return { contractVersion: API_CONTRACT_VERSION, requestId, outcome: outcomeOf(count) };
}

/**
 * A typed failure: `{ body, status }` for `NextResponse.json(body, { status })`.
 * `retryable` defaults from the outcome — a down desk is worth a retry, a bad
 * cursor is not until the client restarts from page one.
 */
export function failure(outcome, code, message, { retryable, requestId = newRequestId(), status } = {}) {
  if (!OUTCOMES.includes(outcome) || outcome === "ok" || outcome === "empty") {
    throw new Error(`failure(): "${outcome}" is not a failure outcome`);
  }
  const retry = retryable ?? (outcome === "unavailable" || outcome === "rate_limited");
  return {
    status: status || STATUS[outcome] || 500,
    body: {
      contractVersion: API_CONTRACT_VERSION,
      requestId,
      outcome,
      error: { code, message, retryable: retry },
    },
  };
}
