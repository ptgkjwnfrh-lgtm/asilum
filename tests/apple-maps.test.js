// tests/apple-maps.test.js — Apple Maps through MapKit JS (31 Oct 2026):
// the token is a real ES256 JWT the key's public half verifies, OFF is
// enabled:false with the reason and the schematic, ON is a token and never the key,
// the policy lets Apple's script in, and every place surface draws through
// the one PlaceMap. Reverted, the policy and the pins fail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { loadRoute, callRoute } from "./helpers/route.js";

const ENV = ["MAPKIT_TEAM_ID", "MAPKIT_KEY_ID", "MAPKIT_PRIVATE_KEY", "MAPKIT_ORIGIN"];
function withEnv(patch, fn) {
  const was = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, patch);
  const restore = () => { for (const k of ENV) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; } };
  try { const out = fn(); if (out && typeof out.then === "function") return out.finally(restore); restore(); return out; }
  catch (e) { restore(); throw e; }
}
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" });

test("MapKit: the token is an ES256 JWT — team, key id, thirty minutes, the origin when bound — that the key's public half verifies and a stranger's does not", async () => {
  const { mintMapkitToken, readMapkitToken, MAPKIT_TOKEN_TTL_S } = await import("../lib/places/mapkit.js");
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  const { token, expiresAt } = mintMapkitToken({ teamId: "TEAM123456", keyId: "KEY1234567", privateKey: PEM, origin: "https://asilum.example", now });
  const read = readMapkitToken(token, pair.publicKey);
  assert.deepEqual(read.header, { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.equal(read.payload.iss, "TEAM123456");
  assert.equal(read.payload.origin, "https://asilum.example");
  assert.equal(read.payload.exp - read.payload.iat, MAPKIT_TOKEN_TTL_S);
  assert.equal(expiresAt, new Date(now + MAPKIT_TOKEN_TTL_S * 1000).toISOString());
  assert.equal(read.verified, true);
  const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey;
  assert.equal(readMapkitToken(token, other).verified, false, "another key does not verify it");
  const unbound = readMapkitToken(mintMapkitToken({ teamId: "T", keyId: "K", privateKey: PEM, now }).token);
  assert.equal("origin" in unbound.payload, false, "no origin claim when none is given");
  // a dashboard paste: the newlines as the two characters \n
  const escaped = PEM.replace(/\n/g, "\\n");
  assert.equal(readMapkitToken(mintMapkitToken({ teamId: "T", keyId: "K", privateKey: escaped, now }).token, pair.publicKey).verified, true);
  assert.throws(() => mintMapkitToken({ teamId: "T", keyId: "K", privateKey: "not a key", now }), /not a PEM/);
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(() => mintMapkitToken({ teamId: "T", keyId: "K", privateKey: rsa, now }), /not an EC key/);
});

test("MapKit: OFF is enabled:false with the reason and no Apple; ON is a token and the script, never the key; a malformed key is a 503, not a crash", async () => {
  const { mapkitEnabled, mapkitReason } = await import("../lib/places/mapkit.js");
  const route = await loadRoute("app/api/mapkit/token/route.js");
  await withEnv({}, async () => {
    assert.equal(mapkitEnabled(), false);
    assert.match(mapkitReason(), /MAPKIT_TEAM_ID, MAPKIT_KEY_ID, MAPKIT_PRIVATE_KEY/);
    const { status, body } = await callRoute(route.GET, { path: "/api/mapkit/token", cookies: { "asilum-uid": "u-off" } });
    assert.equal(status, 200, "an expected 'no key' is not a failure for the console to log");
    assert.equal(body.enabled, false);
    assert.match(body.reason, /Apple Developer Program/);
    assert.equal(body.token, undefined);
  });
  await withEnv({ MAPKIT_TEAM_ID: "TEAM123456", MAPKIT_KEY_ID: "KEY1234567", MAPKIT_PRIVATE_KEY: PEM }, async () => {
    assert.equal(mapkitEnabled(), true);
    assert.equal(mapkitReason(), null);
    const { status, body } = await callRoute(route.GET, { path: "/api/mapkit/token", cookies: { "asilum-uid": "u-on" } });
    assert.equal(status, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.source, "Apple MapKit JS");
    assert.match(body.script, /^https:\/\/cdn\.apple-mapkit\.com\/mk\/5/);
    assert.match(body.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.ok(!JSON.stringify(body).includes("PRIVATE KEY"), "the key never reaches the page");
  });
  await withEnv({ MAPKIT_TEAM_ID: "T", MAPKIT_KEY_ID: "K", MAPKIT_PRIVATE_KEY: "garbage" }, async () => {
    const { status, body } = await callRoute(route.GET, { path: "/api/mapkit/token", cookies: { "asilum-uid": "u-bad" } });
    assert.equal(status, 503);
    assert.match(body.reason, /refused/);
  });
});

test("MapKit: the policy lets Apple's script and styles in beside Stripe's, and nothing else new", async () => {
  const config = (await import("../next.config.mjs")).default;
  const headers = await config.headers();
  const csp = headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
  const directive = (name) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "));
  assert.match(directive("script-src"), /https:\/\/js\.stripe\.com https:\/\/cdn\.apple-mapkit\.com/);
  assert.match(directive("style-src"), /https:\/\/cdn\.apple-mapkit\.com/);
  assert.doesNotMatch(directive("frame-src"), /apple/, "Apple's map is a script, not a frame");
  assert.equal((csp.match(/apple-mapkit/g) || []).length, 2);
});

test("MapKit: the map popup and the places panel draw through PlaceMap; the region a centre names is its radius in km; the world without one", async () => {
  const sheet = fs.readFileSync(new URL("../app/components/MapSheet.jsx", import.meta.url), "utf8");
  assert.match(sheet, /import PlaceMap from "\.\/PlaceMap\.jsx"/);
  assert.match(sheet, /<PlaceMap mode="local"/);
  assert.doesNotMatch(sheet, /<FashionMap/, "the popup no longer picks the schematic itself");
  const panel = fs.readFileSync(new URL("../app/components/PlacesPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /useMapkitGate\(\)/);
  assert.match(panel, /mapGate === "apple"\s*\?\s*<PlaceMap/);
  const map = fs.readFileSync(new URL("../app/components/PlaceMap.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(map, /#[0-9a-fA-F]{3,8}\b/, "no literal colour: the pins read --red and --grey");
  assert.match(map, /fetch\("\/api\/mapkit\/token"/);
  assert.match(map, /if \(!live \|\| !d\.enabled\) return null;/, "an unkeyed deploy never loads Apple's script");
  // the pure geometry, without a DOM
  const src = map.slice(map.indexOf("export function regionFor"), map.indexOf("export function AppleMap"));
  const regionFor = new Function(src.replace("export function", "function") + "; return regionFor;")();
  const r = regionFor({ lat: 40.7, lng: -74 }, 30);
  assert.equal(r.lat, 40.7);
  assert.ok(Math.abs(r.latDelta - 60 / 110.57) < 1e-9, "60 km of latitude across");
  assert.ok(r.lngDelta > r.latDelta, "longitude stretches at 40°N");
  assert.deepEqual(regionFor(null, 30), { lat: 20, lng: 0, latDelta: 140, lngDelta: 360 });
});
