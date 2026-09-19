// Synergy round, second batch (19 Sep 2026).
//
// Law 1: the taste network hands the client the open lanes beside the nodes,
//        from the same source the feed reads.
// Law 2: a correction can name the serve it answers; the event carries it
//        and the policy version, and a malformed serve id is refused.
// Law 3: the steward watches the model seam and the new tables, and every
//        check has a boundary entry (the steward's own law).
// Law 4: the composed V.2 gates pass on this commit.
import test from "node:test";
import assert from "node:assert/strict";
import { CHECKS, userRecords, correctionLanes, aiModelEvents } from "../lib/steward/checks.js";
import { BOUNDARY } from "../lib/steward/decisions.js";
import { recordCorrection } from "../lib/asterisk/explain.js";
import { listEvents } from "../lib/db/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";
import { POLICY_VERSION } from "../lib/brain/policy.js";
import { measureV2Gates } from "../scripts/measure-v2-gates.mjs";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";
import { findCareerEntity, entityDto, registryCoverage } from "../lib/people/careers.js";
import { resolveOverviewForQuery } from "../lib/people/resolve.js";

test("law 1: /api/taste GET carries the open lanes and the policy version", async () => {
  const route = await loadRoute("app/api/taste/route.js");
  const me = newDevice();
  const piece = CATALOG.find((it) => Number(it.price) > 200 && it.brand && it.category);
  await recordCorrection(me.uid, { productId: piece.id, code: "too-expensive" });
  await recordCorrection(me.uid, { productId: piece.id, code: "too-large" });
  const res = await callRoute(route.GET, { path: "/api/taste", cookies: me.cookies, query: { user: me.uid } });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(res.body.policyVersion, POLICY_VERSION);
  assert.equal(res.body.lanes.priceCeilingCents, Math.round(piece.price * 100));
  assert.equal(res.body.lanes.fitHints[0].direction, "runs-large");
  assert.deepEqual(res.body.lanes.excludedBrands, []);
  assert.ok(Array.isArray(res.body.nodes), "the network is still there");
});

test("law 2: a correction names its serve; the event carries serveId and policyVersion; a bad id is refused", async () => {
  const route = await loadRoute("app/api/why/route.js");
  const me = newDevice();
  const piece = CATALOG.find((it) => Number(it.price) > 200);
  const bad = await callRoute(route.POST, { path: "/api/why", cookies: me.cookies, json: { user: me.uid, productId: piece.id, code: "not-interested", serveId: "no spaces here!" } });
  assert.equal(bad.status, 400);
  const ok = await callRoute(route.POST, { path: "/api/why", cookies: me.cookies, json: { user: me.uid, productId: piece.id, code: "not-interested", serveId: "srv_abc123" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const events = await listEvents(me.uid, 20);
  const evt = events.find((e) => e.type === "USER_CORRECTED_RECOMMENDATION" && e.payload?.code === "not-interested");
  assert.ok(evt, "the event was written");
  assert.equal(evt.payload.serveId, "srv_abc123");
  assert.equal(evt.payload.policyVersion, POLICY_VERSION);
  assert.equal(evt.payload.lane, "item");
});

test("law 3: the new steward checks exist, report unmeasurable without a database, and have boundary entries", async () => {
  for (const check of [userRecords, correctionLanes, aiModelEvents]) {
    assert.ok(CHECKS.includes(check), `${check.id} is registered`);
    const r = await check.run({ query: null });
    assert.equal(r.state, "unmeasurable");
    assert.ok(BOUNDARY.some((b) => b.check === check.id && b.tier === "never"), `${check.id} has a never-tier boundary entry`);
  }
  // a fake query proves the shape each check answers with data
  const fake = async (sql) => {
    if (/from user_records\b(?![\s\S]*group by user_id)/.test(sql)) return { rows: [{ total: 12, oversized: 0, people: 3 }] };
    if (/group by user_id, kind/.test(sql)) return { rows: [] };
    if (/from user_corrections/.test(sql)) return { rows: [{ code: "too-expensive", n: 10, undone: 1 }, { code: "not-interested", n: 5, undone: 0 }] };
    if (/from ai_model_events/.test(sql)) return { rows: [{ feature: "stylist", status: "ok", n: 8 }, { feature: "stylist", status: "error", n: 2 }] };
    throw new Error("unexpected sql: " + sql);
  };
  const rec = await userRecords.run({ query: fake });
  assert.equal(rec.state, "ok");
  assert.match(rec.evidence, /12 records for 3 people/);
  const lanes = await correctionLanes.run({ query: fake });
  assert.equal(lanes.state, "ok");
  assert.equal(lanes.detail.total, 15);
  assert.equal(lanes.detail.lanes["too-expensive"].undone, 1);
  const ai = await aiModelEvents.run({ query: fake });
  assert.equal(ai.state, "note");
  assert.equal(ai.detail.errors, 2);
  assert.equal(ai.detail.byFeature.stylist.ok, 8);
});

test("law 4: the composed V.2 gates pass on this commit", async () => {
  const r = await measureV2Gates();
  const failed = Object.entries(r.results).filter(([, v]) => !v.pass).map(([k, v]) => `${k}=${JSON.stringify(v.value)}`);
  assert.deepEqual(failed, [], "red gates");
  assert.equal(r.verdict, "PASS");
  assert.equal(r.results.G1_pair_violations.value, 0);
  assert.equal(r.results.G3_cursor_dup_skip.value, 0);
});

test("law 5: every designer the catalog credits has a sourced overview, and a house carries the origin the search engine reads", () => {
  const credited = new Map();
  for (const it of CATALOG) for (const d of it.designers || []) if (d !== it.brand) credited.set(d, it.brand);
  // a house written into designers[] ("Dior" on Dior Men, "Adidas" on Adidas Originals) is a house, not a person
  for (const name of [...credited.keys()]) if (findCareerEntity(name, "house") && !findCareerEntity(name, "designer")) credited.delete(name);
  const missing = [...credited.keys()].filter((name) => !findCareerEntity(name, "designer"));
  assert.deepEqual(missing, [], "credited designers without a registry entity");
  for (const [name, brand] of credited) {
    const dto = entityDto(findCareerEntity(name, "designer").id);
    assert.ok(dto.overview?.summary?.sourceIds?.length, `${name}: overview sourced`);
    const r = resolveOverviewForQuery(name, { pool: CATALOG });
    assert.equal(r.overview?.name, dto.name, `${name}: the name resolves to its overview`);
    assert.ok(r.related.length >= 1, `${name}: at least one dated tenure`);
    void brand;
  }
  const cov = registryCoverage();
  assert.ok(cov.designers >= 50 && cov.edges >= 85 && cov.sources >= 140, JSON.stringify(cov));
  const gucci = entityDto("gucci");
  assert.equal(gucci.origin?.country, "Italy");
  assert.equal(gucci.origin?.source, "lib/asterisk/houses.js");
  assert.equal(entityDto("tom-ford").origin, null, "a person has no origin row");
  const abloh = resolveOverviewForQuery("virgil abloh: louis vuitton", { pool: CATALOG });
  assert.equal(abloh.query.designerId, "virgil-abloh");
  assert.equal(abloh.related.find((e) => e.houseId === "louis-vuitton").matchingItemCount, 12);
});
