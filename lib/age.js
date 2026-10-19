// lib/age.js
// The age gate. Isomorphic: the signup sheet and the server compute the same
// answer from the same function, because two implementations of "how old is
// this person" is how a gate develops a hole.
//
// OWNER DECISION #2 (23 Aug 2026): 13+, self-declared at account creation.
// Recorded in docs/OWNER-DECISIONS.md; engineering does not set this number.
//
// WHY THE BIRTH DATE IS STORED AND NOT A BOOLEAN. Someone who is 12 today is
// 13 next year. A one-off "confirmed 13+" flag freezes the answer at signup
// and silently never re-evaluates, so a refused 12-year-old stays refused
// forever and — worse — an accepted answer can never be re-checked against a
// raised minimum. The date is the only thing that stays true.

export const MINIMUM_AGE = 13;

// Nobody alive is older than this, and a birth date beyond it is a typo or a
// probe, not a person. Rejecting it keeps obviously-junk dates out of a column
// that is otherwise trusted arithmetic.
export const OLDEST_PLAUSIBLE_AGE = 120;

/**
 * Whole years from `birthDate` to `asOf`. Calendar-correct: the birthday has
 * to have PASSED, so 12 years and 364 days is 12.
 *
 * `asOf` is injected rather than read from the clock so the tests can pin
 * boundaries — a gate whose behaviour depends on today's date is a gate that
 * cannot be tested at its edges.
 */
export function ageOn(birthDate, asOf) {
  const born = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(born.getTime()) || Number.isNaN(now.getTime())) return null;

  // UTC throughout. Local getters would make the boundary depend on the
  // reader's timezone, so the same person would be 13 in Tokyo and 12 in
  // Los Angeles on the same instant.
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** A "YYYY-MM-DD" string, or "" if it is not one. Rejects 2026-02-30. */
export function normalizeBirthDate(input) {
  const text = String(input || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date rolls over silently: Feb 30 becomes Mar 2. Round-trip to catch it.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return "";
  }
  return text;
}

/**
 * The gate. Returns { ok, age, reason }.
 *
 * A refusal reason is deliberately COARSE — "under" rather than "you are 11".
 * Echoing the computed age back tells someone retrying exactly how far to move
 * the date, which turns the gate into a tutorial for getting past it.
 */
export function checkAge(birthDate, asOf = new Date()) {
  const normalized = normalizeBirthDate(birthDate);
  if (!normalized) return { ok: false, age: null, reason: "invalid" };

  const age = ageOn(normalized, asOf);
  if (age === null) return { ok: false, age: null, reason: "invalid" };
  if (age < 0 || age > OLDEST_PLAUSIBLE_AGE) return { ok: false, age: null, reason: "invalid" };
  if (age < MINIMUM_AGE) return { ok: false, age, reason: "under" };
  return { ok: true, age, reason: "" };
}

/** Copy the signup sheet shows. One sentence, no number to aim at. */
export const UNDER_AGE_MESSAGE =
  `you need to be ${MINIMUM_AGE} or older to hold an account here.`;
