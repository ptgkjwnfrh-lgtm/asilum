import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  saveProfile, createBoard, addBoardItem, recordInteraction, bumpEdges, bumpPopularity,
} from "../lib/db/index.js";
import {
  exportPersonalizationData, purgePersonalizationData, setFollow, EXPORT_MANIFEST,
  DM_EXPORT_STATUS, RETAINED_AFTER_ERASURE,
} from "../lib/db/production.js";

// CONSTITUTION.md §6 requires every signal to expose
// "edit/disconnect/forget/export/delete controls". Delete existed;
// EXPORT did not, so a user could erase their data but never see it.
//
// THE CONTRACT IS SYMMETRY WITH ERASURE: what we delete is what we show you.
// E1 enforces that mechanically against the real source of purge, so a table
// added to erasure and forgotten in the export fails a test rather than
// quietly narrowing the access right. That is the same class of drift that
// produced the identity_hash ledger bug (#149) — found by diffing two lists
// nobody had ever diffed.

async function fresh(...uids) {
  for (const uid of uids) await purgePersonalizationData(uid).catch(() => {});
}

// The strong one. Reads purge's own DELETE statements out of the source and
// requires every table to be declared in the manifest.
test("E1 every table erasure deletes is declared in the export manifest", () => {
  const src = readFileSync(path.join(process.cwd(), "lib", "db", "production.js"), "utf8");
  const start = src.indexOf("export async function purgePersonalizationData");
  assert.ok(start > 0, "purgePersonalizationData must be findable");
  const end = src.indexOf("\n// ---- §6 export", start);
  const body = src.slice(start, end === -1 ? src.length : end);

  const erased = [...new Set(
    [...body.matchAll(/DELETE FROM ([a-z_]+)/g)].map((m) => m[1])
  )].sort();
  assert.ok(erased.length > 20, `expected purge to cover many tables, saw ${erased.length}`);

  const declared = new Set(Object.keys(EXPORT_MANIFEST));
  const undeclared = erased.filter((t) => !declared.has(t));
  assert.deepEqual(undeclared, [],
    "these tables are erased but not declared in EXPORT_MANIFEST — the export " +
    "would silently omit data the user is entitled to see");
});

// The manifest must not claim coverage it does not have either.
test("E2 the manifest declares nothing erasure does not touch", () => {
  const src = readFileSync(path.join(process.cwd(), "lib", "db", "production.js"), "utf8");
  const start = src.indexOf("export async function purgePersonalizationData");
  const end = src.indexOf("\n// ---- §6 export", start);
  const body = src.slice(start, end === -1 ? src.length : end);
  const erased = new Set([...body.matchAll(/DELETE FROM ([a-z_]+)/g)].map((m) => m[1]));

  const phantom = Object.keys(EXPORT_MANIFEST).filter((t) => !erased.has(t));
  assert.deepEqual(phantom, [],
    "declared in the manifest but never erased — either erasure has a gap or " +
    "the manifest is describing a table that is not the user's to export");
});

test("E3 the export actually contains the user's data", async () => {
  const user = "u-export-e3";
  await fresh(user);

  await saveProfile(user, { long: { TAILORED: 0.8 }, session: {}, _meta: { seen: ["x"] } });
  const board = await createBoard(user, "export board");
  await addBoardItem(board.id, { id: "e3-item", title: "piece", tags: ["TAILORED"] });
  await recordInteraction(user, "e3-item", "favorite", null);
  await setFollow(user, "brand", "Helmut Lang", true);

  const out = await exportPersonalizationData(user);

  assert.equal(out.identity.id, user);
  assert.equal(out.identity.kind, "device", "a u- identity is a device, not an account");
  assert.equal(out.data.taste.long.TAILORED, 0.8, "taste is included");
  assert.equal(out.data.boards.length, 1, "boards are included");
  assert.equal(out.data.interactions.rows.length, 1, "interactions are included");
  assert.deepEqual(out.data.follows.map((f) => f.target), ["Helmut Lang"]);

  await fresh(user);
});

// §6: "No silent caps: any bounded retrieval reports its truncation."
//
// E4 CHECKS SHAPE ONLY, and on a near-empty identity it asserts
// `truncated === false` — which is true no matter how broken the caps are.
// It passed while the export was silently returning 500 of a user's 3,000
// interactions under `cap: 5000, truncated: false`. E8 below is the test that
// actually detects that; this one is kept for the shape contract, relabelled
// so nobody mistakes it for a truncation test again.
test("E4 every bounded domain carries the cap/truncated SHAPE (not the values)", async () => {
  const user = "u-export-e4";
  await fresh(user);
  await saveProfile(user, { long: { GORP: 0.5 }, session: {}, _meta: {} });

  const out = await exportPersonalizationData(user);
  const boundedDomains = [
    out.data.interactions, out.data.events, out.data.searches, out.data.wardrobe,
    out.data.moodboard.uploads, out.data.moodboard.analyses,
    out.data.stylist.outfits, out.data.stylist.feedback, out.data.stylist.requests,
    out.data.corrections, out.data.aiEvents, out.data.editorial,
  ];
  for (const [i, d] of boundedDomains.entries()) {
    assert.ok(d && Array.isArray(d.rows), `bounded domain ${i} must carry rows`);
    assert.equal(typeof d.cap, "number", `bounded domain ${i} must state its cap`);
    assert.equal(typeof d.truncated, "boolean", `bounded domain ${i} must state truncation`);
    assert.equal(d.truncated, false, "nothing should truncate on a near-empty identity");
  }

  await fresh(user);
});

// Pseudonymous graph contributions are COUNTED, not listed: the content is an
// item pair shared with other people, so exporting rows would hand one user a
// slice of everyone's co-engagement graph. The user's own fact is the count.
test("E5 corroboration is counted, and the count is real", async () => {
  const user = "u-export-e5";
  await fresh(user);
  await saveProfile(user, { long: { GORP: 0.5 }, session: {}, _meta: {} });

  await bumpEdges([{ a: "e5-a", b: "e5-b", w: 1 }], user);
  await bumpPopularity([{ id: "e5-item", eng: 1, imp: 1 }], user);

  const out = await exportPersonalizationData(user);
  assert.equal(out.counts.corroboration.edges, 1, "one corroborated pair");
  assert.equal(out.counts.corroboration.popularity, 1, "one corroborated item");
  assert.ok(out.countedNotDetailed.corroboration.length > 0,
    "and the export must say WHY it is a count rather than rows");

  await fresh(user);
});

// What erasure keeps must be named here too, or the two controls describe
// different worlds and the user cannot reconcile them.
test("E6 the export names what it does not contain, in erasure's own words", async () => {
  const user = "u-export-e6";
  await fresh(user);
  await saveProfile(user, { long: { MINIMAL: 0.3 }, session: {}, _meta: {} });

  const exported = await exportPersonalizationData(user);
  const purged = await purgePersonalizationData(user);

  assert.deepEqual(exported.retained, purged.retained,
    "export and delete must describe the same retained set, word for word");

  await fresh(user);
});

test("E7 an account identity is reported as an account", async () => {
  const user = "sb-11111111-1111-4111-8111-111111111111";
  await fresh(user);
  await saveProfile(user, { long: { TAILORED: 0.2 }, session: {}, _meta: {} });

  const out = await exportPersonalizationData(user);
  assert.equal(out.identity.kind, "account");

  await fresh(user);
});

// THE TEST THAT SHOULD HAVE EXISTED. Found by the Aug 8 codebase audit, in
// code shipped hours earlier: EXPORT_CAPS asked for 5000 interactions, but
// getInteractions clamps its own limit to 500, and bounded() stamped the short
// list with the REQUESTED cap and `truncated: false`. A user with 3,000
// interactions downloaded 500 of them under a header saying nothing was cut —
// the §6 "no silent caps" rule broken by the feature built to satisfy it.
//
// E4 could never have caught it: it asserts truncated === false on an identity
// with almost no data, which is true whatever the caps say. The detector has to
// OVERFLOW a cap and demand the export admit it.
test("E8 a user past a cap gets exactly the cap, and is TOLD it was cut", async () => {
  const user = "u-export-e8";
  await fresh(user);
  await saveProfile(user, { long: { TAILORED: 0.5 }, session: {}, _meta: {} });

  // 520 > the 500 ceiling getInteractions actually enforces.
  const OVERFLOW = 520;
  for (let i = 0; i < OVERFLOW; i++) {
    await recordInteraction(user, `e8-item-${i}`, "favorite", null);
  }

  const out = await exportPersonalizationData(user);
  const d = out.data.interactions;

  // The declared cap must be one the reader can actually honour. Before the
  // fix this read 5000 while the reader returned 500.
  assert.equal(d.cap, 500, "the declared cap must be the reader's REAL ceiling");
  assert.equal(d.rows.length, d.cap, "a user past the ceiling gets exactly the ceiling");
  assert.equal(d.truncated, true,
    "and the export must SAY it was cut — reporting false here is the §6 violation");

  await fresh(user);
});

// The general form of the same defect: any cap that exceeds what its reader
// will return is a silent lie waiting to happen. Assert the invariant directly
// rather than one instance of it.
test("E9 no declared cap exceeds what its reader will actually return", async () => {
  const user = "u-export-e9";
  await fresh(user);
  await saveProfile(user, { long: { GORP: 0.4 }, session: {}, _meta: {} });

  const out = await exportPersonalizationData(user);
  const caps = [
    ["interactions", out.data.interactions.cap, 500],
    ["events", out.data.events.cap, 1000],
    ["wardrobe", out.data.wardrobe.cap, 500],
    ["moodboard.uploads", out.data.moodboard.uploads.cap, 200],
    ["moodboard.analyses", out.data.moodboard.analyses.cap, 200],
    ["stylist.outfits", out.data.stylist.outfits.cap, 100],
    ["stylist.feedback", out.data.stylist.feedback.cap, 500],
    ["corrections", out.data.corrections.cap, 500],
  ];
  for (const [name, declared, readerCeiling] of caps) {
    assert.ok(declared <= readerCeiling,
      `${name}: export declares cap ${declared} but its reader clamps to ${readerCeiling} — ` +
      "the difference is data the user never receives and is never told about");
  }

  await fresh(user);
});

test("E4 every messaging table is either exported or declared absent, with a reason", () => {
  // An UNVERIFIED claim of docs/dm-open-findings-2026-08-23.md, checked and
  // true: erasure and export did not know the DM subsystem existed. No dm_*
  // table is deleted, none is exported, and the retention disclosure did not
  // name them — so the /api/privacy DELETE response listed what it kept and
  // the message store was in neither list. Silence read as "erased".
  //
  // E1 above cannot catch it, and says so in its own comment: it requires
  // every table ERASURE touches to be in the manifest, and a table in NEITHER
  // list passes. This is the missing half, scoped to the subsystem that
  // exposed it: a dm_* table must be exported or declared absent WITH A
  // REASON, so the next messaging table cannot be forgotten the way seven
  // were.
  // process.cwd(), like E1 above — `new URL(import.meta.url).pathname` is
  // percent-encoded, and this repo's directory name has spaces and brackets in
  // it, so that path does not open.
  const root = process.cwd();
  const sql = readFileSync(path.join(root, "supabase", "schema-v40-direct-messages.sql"), "utf8")
    + readFileSync(path.join(root, "supabase", "schema-v41-dm-activity.sql"), "utf8")
    + readFileSync(path.join(root, "supabase", "schema-v42-dm-reactions-unsend.sql"), "utf8");
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(dm_[a-z_]+)/g)].map((m) => m[1]);

  assert.ok(tables.length >= 6, `expected the mail desk's tables, found ${tables.join(", ")}`);

  // A LAW TABLE is not anybody's data. dm_reaction_kinds is a fixed palette
  // granted SELECT-only — the same shape v42 chose deliberately, because an
  // open emoji field is a covert text channel. It is not created per person
  // and belongs in NEITHER list. Named here rather than skipped silently, so a
  // future law table has to be named too.
  const LAW_TABLES = new Set(["dm_reaction_kinds"]);

  for (const table of new Set(tables)) {
    if (LAW_TABLES.has(table)) {
      assert.ok(!(table in EXPORT_MANIFEST) && !(table in DM_EXPORT_STATUS),
        `${table} is a law table and must not be claimed as personal data`);
      continue;
    }
    const exported = table in EXPORT_MANIFEST;
    const declared = table in DM_EXPORT_STATUS;
    assert.ok(exported || declared,
      `${table} is in neither the export manifest nor the declared-absent list — `
      + "which is exactly how the whole subsystem went missing from both");
    if (!exported) {
      assert.ok(DM_EXPORT_STATUS[table].length > 20,
        `${table} is declared absent but the reason is not one`);
    }
  }
  // and the enumeration really did reach the palette — a skip nobody exercises
  // is a rule nobody has
  assert.ok(tables.includes("dm_reaction_kinds"));
});

test("E5 the retention disclosure names the messages it keeps", () => {
  // The /api/privacy DELETE response returns this array verbatim. It listed
  // purchase tickets, deidentified counters and the auth account — and not the
  // message store, which is also kept. A retention list that omits something
  // retained is a false statement to the person who asked to be forgotten.
  const named = RETAINED_AFTER_ERASURE.join(" | ").toLowerCase();
  assert.match(named, /direct messages/, "the messages are named");
  assert.match(named, /other person/, "and WHY they are kept is named with them");
  assert.match(named, /blocks you made/, "so are the safety controls erasure must not undo");

  // and the three original entries are still there — this is an addition, not
  // a rewrite of what was already disclosed
  assert.match(named, /purchase tickets/);
  assert.match(named, /deidentified raw event counters/);
  assert.match(named, /auth account/);

  const source = readFileSync(path.join(process.cwd(), "lib", "db", "production.js"), "utf8");
  const literals = source.match(/retained: \[/g) || [];
  assert.deepEqual(literals, [],
    "and no call site rebuilds the list as a literal — the mem branch drifted from "
    + "the Postgres one exactly that way once before");
});
