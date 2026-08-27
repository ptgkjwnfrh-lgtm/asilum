// tests/authenticated-wiring.test.js
// A BUTTON THAT CANNOT PROVE WHO IS PRESSING IT DOES NOTHING.
//
// THE BUG THIS EXISTS TO PREVENT, because it shipped and ran in production:
//
//   MailDesk.jsx made all eleven of its calls with a bare `fetch`. DMs require
//   an ACCOUNT identity (sb-) by ADR-002, and an account identity is provable
//   ONLY by the `Authorization: Bearer` header — lib/supabase.js
//   getAuthenticatedUser reads that header and has no cookie fallback. So the
//   route could never confirm the sb- id the UI was claiming, and every DM
//   request answered 401. Inbox, send, accept, block: none of it could work
//   for anybody, while the feature was live.
//
//   AccountSignup.jsx did the same for the AGE ASSERTION and the ACCOUNT KIND,
//   and swallowed the 401 in a `catch`. The 13+ gate was never recorded, and
//   every business signup was silently filed as a passport.
//
//   KindGate.jsx did the same on a read, so a business was told it was a
//   passport and redirected off its own analytics.
//
// None of it was visible: the production check was "401 not 404", which only
// proves a feature flag is on, and the CI tests cover the database layer
// rather than the browser wiring. Nothing in the suite asked the one question
// that mattered — does the call carry proof of identity?
//
// It does now.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Endpoints that resolve a caller and refuse an unproven one. A bare fetch to
// any of these is either a 401 or, worse, a silently wrong answer for the
// DEVICE when the UI meant the ACCOUNT.
const NEEDS_PROOF = [
  "dm", "boards", "wardrobe", "orders", "tickets", "measurements",
  "asterisk/memory", "privacy", "outfits", "similar", "moodboard", "train",
  "interaction", "impressions", "follow", "checkout", "business",
  "account/kind", "account/age", "profile/room", "ticket-fee", "booth-visit",
  "impersonation", "reset", "style-profile", "connect", "why",
];

// Calls that genuinely need no identity, each with the reason it is exempt.
// An entry here is a CLAIM that the endpoint answers the same for everyone —
// add one only when that is true.
const PUBLIC_BY_DESIGN = new Map([
  ["app/page.js::/api/boards", "a board fetched BY ID is a shared link, not the caller's own shelf"],
  ["app/u/[handle]/page.js::/api/profile/room", "a published room is public by handle"],
  ["app/cover/page.js::/api/business", "the booth list on the cover is public"],
]);

const CALL = /(?<![A-Za-z_$.])fetch\(\s*("|`)(\/api\/[^"`?\s]+)/g;

test("every call to an authenticated endpoint carries proof of identity", () => {
  const files = execSync(
    "find app -type f \\( -name '*.js' -o -name '*.jsx' \\) -not -path '*/api/*'",
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);

  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(CALL)) {
      const endpoint = match[2];
      const path = endpoint.replace(/^\/api\//, "").replace(/\/$/, "");
      const guarded = NEEDS_PROOF.some((a) => path === a || path.startsWith(`${a}/`));
      if (!guarded) continue;
      if (PUBLIC_BY_DESIGN.has(`${file}::${endpoint}`)) continue;
      violations.push(`${file} calls ${endpoint} with a bare fetch`);
    }
  }

  assert.deepEqual(violations, [],
    "use authorizedFetch (or postJSON/sendJSON) — a bare fetch sends no bearer "
    + "token, so the route cannot confirm an sb- identity and answers 401, or "
    + "silently answers for the device instead of the account");
});

test("the mail desk in particular never uses a bare fetch", () => {
  // Singled out because it is the surface the bug shipped on, and because it
  // is the one place where EVERY call needs an account identity — DMs are
  // impossible for a device by construction.
  const src = readFileSync("app/components/MailDesk.jsx", "utf8");
  assert.match(src, /authorizedFetch/, "MailDesk must import authorizedFetch");
  assert.equal([...src.matchAll(CALL)].length, 0,
    "every MailDesk call must go through authorizedFetch");
});

test("the exemption list stays honest", () => {
  // An exemption is a claim that an endpoint answers the same for everyone.
  // If one is left behind after its call site moves, the list is quietly
  // granting permission nobody checked.
  for (const [key, reason] of PUBLIC_BY_DESIGN) {
    const [file, endpoint] = key.split("::");
    const src = readFileSync(file, "utf8");
    assert.ok(src.includes(endpoint),
      `${file} no longer calls ${endpoint} — drop the exemption ("${reason}")`);
  }
});
