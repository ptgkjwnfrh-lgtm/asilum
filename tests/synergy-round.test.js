// The synergy round (19 Sep 2026): the systems say the same thing to each other.
//
// Law 1: the memory facade names the lanes that apply now (price ceiling,
//        fit hints) and the policy version every learning surface carries.
// Law 2: /api/search pages by the same signed cursor as /api/discover.
// Law 3: one overview path — a legacy person record reaches the client in
//        the same contract shape as a registry entity.
// Law 4: the committed fixtures cannot drift from the routes in silence: the
//        generator's output has the same keys as what is committed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { asteriskMemory } from "../lib/asterisk/memory.js";
import { recordCorrection } from "../lib/asterisk/explain.js";
import { POLICY_VERSION, POLICY_NOTES } from "../lib/brain/policy.js";
import { resolveOverviewForQuery, legacyEntityDto } from "../lib/people/resolve.js";
import { OVERVIEWS } from "../lib/people/overviews.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";

test("law 1: the memory facade carries the open lanes and the policy version", async () => {
  const me = newDevice();
  const piece = CATALOG.find((it) => Number(it.price) > 200 && it.brand && it.category);
  await recordCorrection(me.uid, { productId: piece.id, code: "too-expensive" });
  const small = await recordCorrection(me.uid, { productId: piece.id, code: "too-small" });
  const m = await asteriskMemory(me.uid);
  assert.equal(m.memory.policyVersion, POLICY_VERSION);
  assert.ok(POLICY_NOTES[POLICY_VERSION], "the version is explained");
  assert.equal(m.memory.explicit.lanes.priceCeilingCents, Math.round(piece.price * 100));
  assert.equal(m.memory.explicit.lanes.fitHints.length, 1);
  assert.equal(m.memory.explicit.lanes.fitHints[0].brand, piece.brand);
  const feed = await loadRoute("app/api/feed/route.js");
  const res = await callRoute(feed.GET, { path: "/api/feed", cookies: me.cookies, query: { user: me.uid, limit: "6" } });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(res.body.policyVersion, POLICY_VERSION, "the feed says which policy served it");
  void small;
});

test("law 2: /api/search pages by cursor — no repeat, no skip, stale refused, policy named", async () => {
  const route = await loadRoute("app/api/search/route.js");
  const p1 = await callRoute(route.GET, { path: "/api/search", query: { q: "jacket", limit: "5" } });
  assert.equal(p1.status, 200);
  assert.equal(p1.body.policyVersion, POLICY_VERSION);
  assert.equal(p1.body.results.length, 5);
  assert.equal(p1.body.limit, 5);
  assert.ok(p1.body.total > 5);
  assert.ok(p1.body.nextCursor);
  const p2 = await callRoute(route.GET, { path: "/api/search", query: { q: "jacket", limit: "5", cursor: p1.body.nextCursor } });
  assert.equal(p2.status, 200);
  assert.equal(p2.body.offset, 5);
  const ids1 = new Set(p1.body.results.map((r) => r.id));
  for (const r of p2.body.results) assert.ok(!ids1.has(r.id), "no repeat across pages");
  assert.equal(p2.body.snapshotId, p1.body.snapshotId);
  const stale = await callRoute(route.GET, { path: "/api/search", query: { q: "coat", limit: "5", cursor: p1.body.nextCursor } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.outcome, "stale_cursor");
  const legacy = await callRoute(route.GET, { path: "/api/search", query: { q: "jacket" } });
  assert.equal(legacy.body.results.length, Math.min(48, legacy.body.total), "no limit given still means 48, as before");
  assert.equal(legacy.body.items.length <= 6, true, "the legacy facets are still there");
});

test("law 3: a legacy person record reaches the client in the contract shape", () => {
  const olivier = OVERVIEWS.find((o) => o.id === "olivier-rousteing");
  const dto = legacyEntityDto(olivier);
  assert.equal(dto.kind, "designer");
  assert.equal(dto.legacy, true);
  assert.ok(dto.overview.summary.text.length > 20);
  assert.ok(dto.sources.length >= 2);
  assert.ok(dto.image?.url);
  assert.equal(dto.image.rights, "CC BY 4.0");
  for (const f of dto.facts) assert.ok(f.claim.sourceIds.length >= 1, "every legacy claim keeps its source");
  const r = resolveOverviewForQuery("olivier rousteing", { pool: CATALOG });
  assert.equal(r.overview.id, "olivier-rousteing");
  assert.equal(r.query.designerId, "olivier-rousteing");
  assert.ok(r.related.some((e) => e.houseId === "balmain"), "the registry's Balmain tenure rides along");
  const typo = resolveOverviewForQuery("olivier rousting", { pool: CATALOG });
  assert.equal(typo.overview?.id, "olivier-rousteing", "the legacy typo tolerance is kept");
  assert.equal(resolveOverviewForQuery("black leather jacket").overview, null);
});

test("law 4: the committed fixtures have the keys the routes produce today", () => {
  const committed = path.join(process.cwd(), "docs", "v2", "fixtures");
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "v2-fixtures-"));
  execFileSync(process.execPath, ["scripts/v2-fixtures.mjs"], {
    cwd: process.cwd(), env: { ...process.env, V2_FIXTURES_OUT: fresh, DATABASE_URL: "" }, stdio: "pipe",
  });
  const shape = (v, depth = 0) => {
    if (Array.isArray(v)) return v.length ? ["[]", shape(v[0], depth + 1)] : ["[]"];
    if (v && typeof v === "object") {
      if (depth > 4) return "{…}";
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k], depth + 1)]));
    }
    return typeof v;
  };
  const files = fs.readdirSync(committed).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(fs.readdirSync(fresh).filter((f) => f.endsWith(".json")).sort(), files, "the same set of fixtures");
  for (const f of files) {
    const a = shape(JSON.parse(fs.readFileSync(path.join(committed, f), "utf8")));
    const b = shape(JSON.parse(fs.readFileSync(path.join(fresh, f), "utf8")));
    assert.deepEqual(a, b, `${f}: the committed fixture's shape drifted from the route — run node scripts/v2-fixtures.mjs and commit`);
  }
});
