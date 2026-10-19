// lib/brain/policy.js — the one version string every learning surface carries.
//
// A learning event, a recommendation response and the memory facade name the
// policy that produced them (docs/v2/CONTRACTS.md § Learning events), so a
// replay or an audit can tell which ranker, which decay law and which
// correction lanes were in force. Bump when any of those change behaviour.
//
// Pure constant; safe for the client bundle.

export const POLICY_VERSION = "2026-09-19.2";

/** What this version means, so the string is not a mystery in a log. */
export const POLICY_NOTES = Object.freeze({
  "2026-09-19.2": "search reads tasteVector; decay by evidence class; reduce recorded; fit hints reach the ladder",
  "2026-09-19.1": "reason-specific lanes with scope + undo; typed outcomes; stable cursors",
});
