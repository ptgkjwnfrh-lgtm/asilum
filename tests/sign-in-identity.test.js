// tests/sign-in-identity.test.js
// BEING SIGNED IN IS NOT CONTINGENT ON YOUR TASTE MOVING.
//
// THE BUG THIS EXISTS TO PREVENT, because it shipped and users hit it:
//
//   `setUid(account)` sat behind an `adopted` flag, so any failure of the
//   taste-adoption POST left localStorage holding the old `u-` device id while
//   the Supabase session was perfectly valid.
//
//   The visible cost was messaging. MailDesk gates on
//   `getUid().startsWith("sb-")` — correctly, since DMs are impossible for a
//   device identity under ADR-002 — so a failed adoption removed the mail desk
//   ENTIRELY on that device, permanently, with nothing on screen connecting the
//   two. It presented as "DMs work on my phone but not my laptop": adoption is
//   heavier on the device with more history to move, and fails there first.
//
//   Two unrelated things were coupled — whether your taste TRANSFERRED decided
//   whether you could see your MESSAGES.
//
// Asserted at source level because this lives inside a React sign-in effect
// with a Supabase session in it; the coupling is what matters, and the coupling
// is visible in the text. Same approach as tests/authenticated-wiring.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHELL = readFileSync("app/shell.js", "utf8");
const MAILDESK = readFileSync("app/components/MailDesk.jsx", "utf8");

/** The sign-in effect, from the adoption attempt to the end of its promise. */
function adoptionBlock() {
  const start = SHELL.indexOf("let adopted = false;");
  assert.ok(start > 0, "the adoption block must still be findable");
  const end = SHELL.indexOf("await pending.promise", start);
  return SHELL.slice(start, end > 0 ? end : start + 3000);
}

test("the account identity is set whatever adoption did", () => {
  // CODE lines only. The first version of this test searched every line and
  // matched the explanatory COMMENT above the fix — which also contains the
  // string `setUid(account)` — so it read the wrong guard and passed with the
  // bug reintroduced. Strip comments before looking for code.
  const lines = adoptionBlock().split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const i = lines.findIndex((l) => l.includes("setUid(account)"));
  assert.ok(i >= 0, "sign-in must still record the account identity");

  // The guard immediately above setUid must not mention `adopted`.
  const guard = lines.slice(Math.max(0, i - 3), i).join(" ");
  assert.doesNotMatch(guard, /\badopted\b/,
    "identity must not be gated on adoption — a failed taste transfer must "
    + "not leave a signed-in reader holding a device id, which silently "
    + "removes the mail desk");
});

test("an adoption failure still tells the reader, and does not overwrite that", () => {
  const block = adoptionBlock();
  assert.match(block, /could not be adopted/,
    "a failed transfer must still be reported");
  assert.match(block, /if \(adopted\) setAuthNotice/,
    "the success notice must not overwrite the failure notice");
});

test("MailDesk still refuses a device identity — the gate itself is correct", () => {
  // The fix is upstream. DMs remain impossible for a `u-` identity by ADR-002,
  // and loosening THIS would be the wrong repair.
  assert.match(MAILDESK, /uid\.startsWith\("sb-"\)/,
    "the mail desk must keep requiring an account identity");
});

test("sign-in records the identity before anything can depend on it", () => {
  // setUid fires the `asilum:identity` event that MailDesk listens for, so the
  // ordering is what lets the desk appear without a reload.
  assert.match(SHELL, /setUid\(account\)/);
  assert.match(MAILDESK, /addEventListener\("asilum:identity"/,
    "MailDesk must react to the identity changing");
});
