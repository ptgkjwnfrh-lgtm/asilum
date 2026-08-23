// tests/age-gate.test.js — the age gate (OWNER DECISION #2: 13+).
//
// This is a safety gate, so it is tested at its EDGES rather than in its
// middle. The day before a 13th birthday and the day of it are the only two
// dates that matter, and a gate that is right for a 30-year-old and wrong on
// the boundary is wrong.
//
// `asOf` is injected everywhere. A test that used the real clock would pass
// today and change meaning tomorrow, which is not a test.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MINIMUM_AGE, OLDEST_PLAUSIBLE_AGE, UNDER_AGE_MESSAGE,
  ageOn, checkAge, normalizeBirthDate,
} from "../lib/age.js";

const AS_OF = new Date("2026-08-23T12:00:00Z");

test("the minimum is the owner's number, not engineering's", () => {
  // Recorded in docs/OWNER-DECISIONS.md #2, 23 Aug 2026. If this constant
  // moves, the decision moved, and that is not a code change to make quietly.
  assert.equal(MINIMUM_AGE, 13);
});

test("the boundary: the birthday must have PASSED", () => {
  // The whole gate lives in these three lines.
  assert.equal(checkAge("2013-08-24", AS_OF).ok, false, "one day before the 13th birthday");
  assert.equal(checkAge("2013-08-23", AS_OF).ok, true, "the 13th birthday itself");
  assert.equal(checkAge("2013-08-22", AS_OF).ok, true, "the day after");

  assert.equal(ageOn("2013-08-24", AS_OF), 12);
  assert.equal(ageOn("2013-08-23", AS_OF), 13);
});

test("a refusal does not tell the reader how far to move the date", () => {
  // Echoing "you are 11" back is a tutorial for getting past the gate.
  const refused = checkAge("2015-01-01", AS_OF);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "under");
  assert.doesNotMatch(UNDER_AGE_MESSAGE, /\d\d\d\d/, "no dates in the copy");
  assert.match(UNDER_AGE_MESSAGE, /13 or older/);
});

test("the boundary does not move with the reader's timezone", () => {
  // Local date getters would make the same instant 13 in Tokyo and 12 in Los
  // Angeles. Everything is UTC, so the answer is one answer.
  const justTurned = "2013-08-23";
  for (const instant of [
    "2026-08-23T00:00:01Z", // first second of the birthday, UTC
    "2026-08-23T23:59:59Z", // last second of it
  ]) {
    assert.equal(checkAge(justTurned, new Date(instant)).ok, true, instant);
  }
  // and the day before is refused at both ends of that day
  assert.equal(checkAge("2013-08-24", new Date("2026-08-23T23:59:59Z")).ok, false);
});

test("a leap-day birthday is handled, and does not fall through a crack", () => {
  // Born 29 Feb 2012. In 2025 (non-leap) the 13th birthday is treated as
  // 1 March by this arithmetic: on 28 Feb they are 12, on 1 March they are 13.
  assert.equal(ageOn("2012-02-29", new Date("2025-02-28T12:00:00Z")), 12);
  assert.equal(ageOn("2012-02-29", new Date("2025-03-01T12:00:00Z")), 13);
});

test("a date that is not a date is refused as invalid, not as under-age", () => {
  // The two refusals mean different things to the person and to the log.
  for (const junk of ["", null, undefined, "yesterday", "2013-13-01", "2013-02-30",
                      "13/08/2013", "2013-8-3", "  ", "0000-00-00"]) {
    const result = checkAge(junk, AS_OF);
    assert.equal(result.ok, false, `${JSON.stringify(junk)} must not pass`);
    assert.equal(result.reason, "invalid", `${JSON.stringify(junk)} is malformed, not under-age`);
  }
  assert.equal(normalizeBirthDate("2013-02-30"), "", "Date silently rolls Feb 30 to Mar 2");
  assert.equal(normalizeBirthDate("2013-08-23"), "2013-08-23");
});

test("a birth date in the future or beyond a human lifespan is invalid", () => {
  assert.equal(checkAge("2030-01-01", AS_OF).reason, "invalid", "not yet born");
  assert.equal(checkAge("1850-01-01", AS_OF).reason, "invalid", "beyond a lifespan");
  // and the boundary of plausibility is honoured rather than approximated
  const oldest = new Date(Date.UTC(
    AS_OF.getUTCFullYear() - OLDEST_PLAUSIBLE_AGE, AS_OF.getUTCMonth(), AS_OF.getUTCDate()));
  assert.equal(checkAge(oldest.toISOString().slice(0, 10), AS_OF).ok, true);
});

test("the gate stays correct as the reader ages — the reason the DATE is stored", () => {
  // A boolean written at signup freezes the answer. Someone refused at 12
  // would stay refused forever, and an accepted answer could never be
  // re-checked against a raised minimum. Same input, two different days:
  const born = "2013-10-05";
  assert.equal(checkAge(born, new Date("2026-10-04T12:00:00Z")).ok, false);
  assert.equal(checkAge(born, new Date("2026-10-05T12:00:00Z")).ok, true);
});

// --- the store --------------------------------------------------------------

test("an under-age date is REFUSED, not stored", async () => {
  // A row that fails the gate has no legitimate use, and storing one means
  // holding a known minor's birth date for nothing.
  const { recordBirthDate, readBirthDate, __resetAccountAgesForTests } =
    await import("../lib/db/accountAges.js");
  __resetAccountAgesForTests();
  const id = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

  const refused = await recordBirthDate(id, "2015-01-01", AS_OF);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "under");
  assert.equal(await readBirthDate(id), null, "nothing was written");

  const accepted = await recordBirthDate(id, "2013-08-23", AS_OF);
  assert.equal(accepted.ok, true);
  assert.equal(await readBirthDate(id), "2013-08-23");
});

test("the gate is re-computed from the stored date, not frozen at signup", async () => {
  // The point of storing the date. Same row, two different days.
  const { recordBirthDate, meetsMinimumAge, __resetAccountAgesForTests } =
    await import("../lib/db/accountAges.js");
  __resetAccountAgesForTests();
  const id = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  await recordBirthDate(id, "2013-08-23", AS_OF);

  assert.equal(await meetsMinimumAge(id, new Date("2026-08-23T00:00:00Z")), true);
  // and a stricter future minimum would re-evaluate the same row rather than
  // trusting a boolean written today
  assert.equal(await meetsMinimumAge(id, new Date("2026-08-22T23:59:59Z")), false,
    "the day before the birthday, the same row does not clear the gate");
});

test("no assertion is not the same as failing", async () => {
  // Conflating them either locks out every pre-existing account or lets every
  // one of them through. The caller must decide, so the store says `null`.
  const { meetsMinimumAge, __resetAccountAgesForTests } =
    await import("../lib/db/accountAges.js");
  __resetAccountAgesForTests();
  assert.equal(await meetsMinimumAge("cccccccc-3333-4333-8333-cccccccccccc"), null);
});

test("ages key on the bare auth uuid, like every other trust domain", async () => {
  const { recordBirthDate, __resetAccountAgesForTests } =
    await import("../lib/db/accountAges.js");
  __resetAccountAgesForTests();
  for (const wrong of ["u-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
                       "sb-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", "guest", ""]) {
    await assert.rejects(() => recordBirthDate(wrong, "2000-01-01", AS_OF), /bare auth uuid/);
  }
});
