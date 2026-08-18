// tests/supabase-auth-gate.test.js — the account half of "who is this request".
//
// `lib/identity.js` decides identity, and `tests/identity.test.js` pins the
// device half: the HMAC cookie, and the rule that an `sb-` claim without a
// verified bearer resolves to nobody. What it CANNOT reach is the layer
// underneath that rule. `resolveRequestUser` delegates every account identity
// to `getAuthenticatedUser` here, so this file is the one link in a chain whose
// every other link was tested — and it is the link that ~32 API routes stand
// on. Each of them opens with `resolveRequestUser(...)` and answers a null with
// 401, so if this module ever stopped failing closed, the 401 would simply stop
// happening and nothing would raise an error.
//
// Three properties are worth more than coverage here:
//
//   1. `authConfigured()` needs BOTH halves. A URL with no key is not a
//      configured client, it is a client that would authenticate against
//      nothing.
//   2. An unconfigured deployment refuses a well-formed bearer. This is the
//      constitution's "runs fully without Supabase" clause read as a security
//      rule rather than a convenience one — absent keys must mean nobody is
//      authenticated, never everybody.
//   3. A request with no usable bearer is refused BEFORE any client work.
//
// A note on what is deliberately NOT tested, because a test that cannot fail
// reads exactly like one that can (this session's ritual, and the three such
// tests it caught). Every assertion below is written so that the header cases
// run with the client CONFIGURED — where a missing guard throws instead of
// returning null — rather than in the unconfigured state, where every path
// returns null and the regex could be deleted with all tests still green.
//
// Mutation run, 17 August — seven introduced, six caught:
//
//   killed    drop the `!match` guard; drop the `!client` guard; `&&` to `||`
//             in authConfigured; drop its `!!` coercion; drop the `^` anchor;
//             `\s+` to `\s*` in the bearer pattern.
//   SURVIVED  inverting the final `error ? null : data?.user || null`.
//
// That last one is a real gap, not an equivalent mutant, and it is the reason
// this note exists. Reaching it needs a configured Supabase to answer a real
// token with a real error, which is a network round trip and a live project —
// so it is covered at the integration level or not at all. Anyone widening
// this file should know that line is unguarded here rather than assume the
// module is fully pinned.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { authConfigured, getAuthenticatedUser, getSupabase } from "../lib/supabase.js";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// Run `fn` with a patched environment, restoring whatever was there before.
async function withEnv(patch, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(patch)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Nothing here reaches the network: creating a client is local, and every
// header below either fails the regex or is used while unconfigured.
const CONFIGURED = { [URL_VAR]: "https://test.supabase.co", [KEY_VAR]: "test-anon-key" };
const UNCONFIGURED = { [URL_VAR]: undefined, [KEY_VAR]: undefined };

// A minimal stand-in for the Next request surface this module touches.
const requestWith = (authorization) => ({
  headers: { get: (name) => (String(name).toLowerCase() === "authorization" ? authorization ?? null : null) },
});

test("authConfigured needs both halves, and treats an empty value as absent", async () => {
  const cases = [
    [{ [URL_VAR]: undefined, [KEY_VAR]: undefined }, false, "neither"],
    [{ [URL_VAR]: "https://test.supabase.co", [KEY_VAR]: undefined }, false, "url only"],
    [{ [URL_VAR]: undefined, [KEY_VAR]: "test-anon-key" }, false, "key only"],
    [{ [URL_VAR]: "", [KEY_VAR]: "test-anon-key" }, false, "empty url"],
    [{ [URL_VAR]: "https://test.supabase.co", [KEY_VAR]: "" }, false, "empty key"],
    [{ [URL_VAR]: "https://test.supabase.co", [KEY_VAR]: "test-anon-key" }, true, "both"],
  ];
  for (const [env, expected, label] of cases) {
    await withEnv(env, () => assert.equal(authConfigured(), expected, label));
  }
});

test("authConfigured answers a boolean, never a leaked key", async () => {
  // The `!!` is what stands between a truthiness check and this function
  // handing its caller the anon key itself.
  await withEnv(CONFIGURED, () => assert.strictEqual(authConfigured(), true));
  await withEnv(UNCONFIGURED, () => assert.strictEqual(authConfigured(), false));
});

test("an unconfigured deployment has no client, rather than a broken one", async () => {
  await withEnv(UNCONFIGURED, async () => {
    assert.equal(await getSupabase(), null);
  });
});

test("an unconfigured deployment refuses a well-formed bearer", async () => {
  // Absent keys must mean nobody is authenticated, never everybody. Without
  // the client guard this throws instead of answering null, and every route's
  // 401 becomes a 500 — still not a bypass, but no longer this module's doing.
  await withEnv(UNCONFIGURED, async () => {
    for (const header of ["Bearer some-token", "bearer some-token", "Bearer " + "x".repeat(400)]) {
      assert.equal(await getAuthenticatedUser(requestWith(header)), null, header.slice(0, 20));
    }
  });
});

test("a request with no usable bearer is refused before any client work", async () => {
  // Configured on purpose: here a missing header guard reaches for `match[1]`
  // and throws, so these assertions can actually fail. Unconfigured, they
  // would pass with the guard deleted.
  await withEnv(CONFIGURED, async () => {
    const refused = [
      [undefined, "no authorization header at all"],
      ["", "an empty header"],
      ["Basic YWJjOjEyMw==", "the wrong scheme"],
      ["Token abc123", "a plausible but wrong scheme"],
      ["NotBearer abc123", "a scheme that merely ends in bearer"],
      ["Bearer", "the scheme with no token"],
      ["Bearer ", "the scheme with whitespace and no token"],
      ["abc123", "a bare token with no scheme"],
      // A leading space belongs here too, but asserting it in THIS test would
      // prove nothing about the `^` anchor — see the anchor test below.
    ];
    for (const [header, label] of refused) {
      assert.equal(await getAuthenticatedUser(requestWith(header)), null, label);
    }
  });
});

// This is the last test that touches module state, on purpose. `getSupabase`
// memoises `_clientPromise` for the
// life of the module, so the rejected promise it creates here would be handed to
// every later caller. Nothing above triggers client construction — the
// unconfigured cases return before it, and the header cases fail the regex — so
// the cache is still empty when we arrive.
test("the scheme must be at the START of the header, not merely somewhere in it", async () => {
  // Proving the `^` anchor is enforced needs a way to tell "the regex matched"
  // apart from "the regex did not", and both answer null on a live client. A
  // MALFORMED url is that discriminator without a network round trip:
  // `createClient` throws on it, so a header that matches now rejects while a
  // header that does not still returns null before any client work.
  await withEnv({ [URL_VAR]: "not-a-url", [KEY_VAR]: "test-anon-key" }, async () => {
    // Positive control: without this, the assertion below could pass for the
    // wrong reason — a header that never reaches the client at all.
    await assert.rejects(
      () => getAuthenticatedUser(requestWith("Bearer abc123")),
      /Invalid supabaseUrl/,
      "a well-formed bearer must reach the client, or this test proves nothing",
    );
    // The real assertion: a leading space means the header is not a bearer.
    assert.equal(await getAuthenticatedUser(requestWith(" Bearer abc123")), null);
    assert.equal(await getAuthenticatedUser(requestWith("X-Bearer abc123")), null);
  });
});

test("the module never reaches for the service-role key", async () => {
  // This file is imported by client components (app/shell.js, the signup form,
  // settings, profile). The anon key is public by design; the service-role key
  // bypasses every RLS policy in supabase/schema.sql. A single import of it
  // here would ship it in the browser bundle, and nothing would look wrong.
  const source = readFileSync(fileURLToPath(new URL("../lib/supabase.js", import.meta.url)), "utf8");
  const offenders = source
    .split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /SERVICE_ROLE|SERVICE_KEY|serviceRole/i.test(line) && !line.trim().startsWith("//"));
  assert.deepEqual(offenders, [], "service-role credentials must never appear in a client-safe module");
});
