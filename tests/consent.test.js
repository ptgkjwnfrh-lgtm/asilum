// tests/consent.test.js — D4's allowance matrix and its copy law.
// UNANSWERED = UNOBSERVED is the whole ruling; this file pins the matrix
// every observation write path consults, plus the moment's promise line.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { consentState, observationAllowed, CONSENT_COOKIE, CONSENT_VERSION } =
  await import("../lib/consent.js");

const reqWith = (value) => ({
  cookies: {
    get: (name) => (name === CONSENT_COOKIE && value ? { value } : undefined),
  },
});

test("consentState: only the two real answers count", () => {
  assert.equal(consentState(reqWith(null)), null);
  assert.equal(consentState(reqWith("observe")), "observe");
  assert.equal(consentState(reqWith("general")), "general");
  assert.equal(consentState(reqWith("yes-please")), null, "junk is unanswered");
  assert.equal(consentState({}), null, "a cookie-less request is unanswered");
  assert.match(CONSENT_VERSION, /^d4-/);
});

test("the allowance matrix: unanswered = unobserved; general = explicit only", () => {
  // unanswered: NOTHING persists
  assert.equal(observationAllowed(null, "passive"), false);
  assert.equal(observationAllowed(null, "explicit"), false);
  // general: the settings pause's long-standing split
  assert.equal(observationAllowed("general", "passive"), false);
  assert.equal(observationAllowed("general", "explicit"), true);
  // observe: everything
  assert.equal(observationAllowed("observe", "passive"), true);
  assert.equal(observationAllowed("observe", "explicit"), true);
});

test("the moment's copy keeps the law's promise, the owner's voice, and the copy law", () => {
  const src = readFileSync(new URL("../app/components/ConsentMoment.jsx", import.meta.url), "utf8");
  assert.match(src, /the Asterisk system\s+does not watch/,
    "the promise line — unanswered means unobserved — is the moment's own words");
  assert.match(src, /THE ASTERISK SYSTEM/, "the engine's public name, per copy law");
  assert.match(src, /WILL NEVER/, "the owner's no-sell promise, verbatim emphasis");
  assert.match(src, /STAMPS/, "the owner's *STAMPS coinage rides the moment");
  assert.match(src, /Seek <span className="red">\*<\/span>ASILUM or disappear into the\s+catalog/,
    "the owner's seek line, their words exactly");
  assert.doesNotMatch(src, /alpha|beta|gamma|delta|epsilon bridge/i,
    "no public mention of the learning bridges");
});
