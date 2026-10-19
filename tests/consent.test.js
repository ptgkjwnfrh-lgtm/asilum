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
  assert.match(src, /seek <b><span className="red">\*<\/span>ASILUM<\/b> or disappear into the catalog\./,
    "the seek line: the star rides the bolded ASILUM (owner, 20 Aug)");
  assert.doesNotMatch(src, /alpha|beta|gamma|delta|epsilon bridge/i,
    "no public mention of the learning bridges");
  assert.match(src, /startsWith\("\/cover"\)/,
    "the magazine's face stays clean — the moment never covers the FRONT COVER (owner order)");
  assert.match(src, /!show \|\| onCover/,
    "the cover suppression is a render law, not just a fetch skip");
});

test("the moment FAILS OPEN: only a positively read answer keeps the question down", () => {
  // The 20 Aug desktop bug: /api/consent answering non-OK (edge challenge,
  // 500) — or 200 with an un-JSON challenge body — silently swallowed the
  // question forever. The law now: unknowable state ASKS. Re-asking an
  // answered device is harmless; never asking is the bug.
  const src = readFileSync(new URL("../app/components/ConsentMoment.jsx", import.meta.url), "utf8");
  assert.match(src, /d\.state === "observe" \|\| d\.state === "general"/,
    "only the two real answers settle the device — junk and challenge bodies must not");
  assert.match(src, /else setShow\(true\)/,
    "anything short of a read answer raises the moment");
  assert.doesNotMatch(src, /if \(dead \|\| !res\.ok\) return/,
    "the silent-swallow guard must stay dead — a failed read may not suppress the question");
});

test("the moment's DOM hooks carry no blocker-bait vocabulary", () => {
  // The second way the question dies silently: cosmetic filter lists and
  // Safari's element-hiding hunt consent/cookie tokens in class and id
  // names, and content blockers stay active in PRIVATE windows. A hidden
  // question is the desktop bug all over again — beyond fail-open's reach,
  // invisible to every log. House vocabulary only.
  const src = readFileSync(new URL("../app/components/ConsentMoment.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /(className|id|aria-labelledby|aria-describedby)="[^"]*(consent|cookie|gdpr|banner|notice)/i,
    "no consent/cookie/gdpr/banner/notice token may ride a DOM hook of the moment");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.consent-(veil|moment|title|body|actions|fine|seek|close)\b/,
    "the old consent-* selectors must not resurface in the stylesheet");
  assert.match(css, /\.moment-veil \{ position: fixed; top: 0; left: 0; right: 0; bottom: 0;/,
    "longhand offsets are the pre-`inset` WebKit fallback — the veil must never depend on the shorthand alone");
});
