// tests/rls-app-policy.test.js — a GRANT is not access.
//
// `schema-v26-business-accounts.sql` created a table, enabled RLS, revoked
// PUBLIC/anon/authenticated, and granted SELECT/INSERT/UPDATE/DELETE to
// `asilum_app`. It read as a careful, complete lockdown. It never created the
// policy, and **with RLS enabled and no policy Postgres default-denies** —
// `asilum_app` has no `rolbypassrls`, so the grant bought nothing. Every read
// returned zero rows and every write was refused, in production, since v26.
//
// It was invisible because the failure state and the correct state are the same
// picture: an empty booth list is exactly what the hotlist shows until brands
// verify. Nothing errored where anyone would see it.
//
// `schema-v11-application-role.sql` back-fills `asilum_app_server_access` over
// every table existing AT v11, so a table created later must add it itself.
// v12 does. v26 did not. This file makes the next one impossible to forget:
//
//   any migration that enables RLS on a table must, in the same file, create
//   the app policy for that table.
//
// It reads migrations rather than the database on purpose — it has to fail in
// CI, where there is no Supabase, at the moment the migration is written rather
// than the day someone notices a feature never worked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SUPA = ROOT + "supabase/";

const files = readdirSync(SUPA).filter((f) => /^schema-v\d+.*\.sql$/.test(f)).sort();
const versionOf = (f) => Number(/^schema-v(\d+)/.exec(f)[1]);

// v11 is the back-fill itself: it enables nothing and policies everything that
// existed then. Tables at or before it are covered by its loop.
const BACKFILL_VERSION = 11;

const read = (f) => readFileSync(SUPA + f, "utf8");

// Assertions about what a migration DOES must not read its prose. These files
// document their own rollback, so `DROP POLICY IF EXISTS …` appears in the
// comment header as well as in the statement — and the first version of the
// idempotency check below matched the comment, passing happily with the real
// DROP deleted. Strip `--` comments before asserting on behaviour.
const code = (f) => read(f).replace(/^\s*--.*$/gm, "");

// `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`
function tablesEnablingRls(sql) {
  return [...sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+ENABLE ROW LEVEL SECURITY/gi)]
    .map((m) => m[1].toLowerCase());
}

// A table is reachable by the app if the same migration creates a policy for
// it that names `asilum_app`, in any of the shapes the repo uses.
function tablesGivenAppPolicy(sql) {
  const named = [...sql.matchAll(/CREATE POLICY\s+\S+\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)[\s\S]{0,120}?asilum_app/gi)]
    .map((m) => m[1].toLowerCase());
  // The v11 loop builds the statement with format(); treat it as covering all.
  const looped = /CREATE POLICY asilum_app_server_access ON public\.%I/.test(sql);
  return { named, looped };
}

test("every migration that enables RLS also gives the app role a policy", () => {
  const gaps = [];
  for (const f of files) {
    if (versionOf(f) <= BACKFILL_VERSION) continue;
    const sql = read(f);
    const enabled = tablesEnablingRls(sql);
    if (!enabled.length) continue;
    const { named, looped } = tablesGivenAppPolicy(sql);
    if (looped) continue;
    for (const t of enabled) {
      // A later migration may supply the policy; accept that too.
      const suppliedLater = files.some((g) => versionOf(g) > versionOf(f) &&
        tablesGivenAppPolicy(read(g)).named.includes(t));
      if (!named.includes(t) && !suppliedLater) {
        gaps.push(`${f}: enables RLS on \`${t}\` but no migration grants asilum_app a policy on it`);
      }
    }
  }
  assert.deepEqual(gaps, [],
    "RLS with no policy is default-DENY — a GRANT does not survive it. Add:\n" +
    "  CREATE POLICY asilum_app_server_access ON <table> FOR ALL TO asilum_app USING (true) WITH CHECK (true);");
});

test("the fix for business_accounts is present and idempotent", () => {
  const fix = files.find((f) => /business-accounts-rls/.test(f));
  assert.ok(fix, "schema-v30-business-accounts-rls.sql must exist");
  const sql = code(fix);
  assert.match(sql, /CREATE POLICY asilum_app_server_access ON business_accounts/);
  // Re-applying a migration must not throw, or apply-schema's --all breaks.
  // Asserted on the STATEMENT, not the rollback note that quotes it.
  assert.match(sql, /DROP POLICY IF EXISTS asilum_app_server_access ON business_accounts/,
    "drop before create, so re-running is a no-op rather than a duplicate-object error");
  assert.ok(sql.indexOf("DROP POLICY") < sql.indexOf("CREATE POLICY"),
    "the DROP must come before the CREATE to be idempotent");
  assert.match(sql, /ON CONFLICT \(version\) DO NOTHING/);
  // The rollback has to be written down; a policy change without one is a
  // change nobody can undo under pressure. This one IS in the prose.
  assert.match(read(fix), /ROLLBACK:/);
});

test("the scanner still recognises the shapes it is about", () => {
  // If these regexes stop matching, every assertion above passes by finding
  // nothing — trap 22. Anchor them on migrations known to contain each shape.
  assert.ok(tablesEnablingRls(read("schema-v26-business-accounts.sql")).includes("business_accounts"),
    "the RLS-enable matcher must still see v26");
  assert.ok(tablesGivenAppPolicy(read("schema-v12-color-and-measurements.sql")).named.includes("user_measurements"),
    "the app-policy matcher must still see v12's explicit CREATE POLICY");
  assert.ok(tablesGivenAppPolicy(read("schema-v11-application-role.sql")).looped,
    "the v11 back-fill loop must still be recognised as covering its tables");
});
