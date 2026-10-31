// lib/places/mapkit.js — APPLE MAPS: the MapKit JS token (owner, 30 and 31
// Oct 2026: "i need apple maps API"). SERVER-ONLY.
//
// WHAT THIS IS. MapKit JS is Apple's web map: the same tiles and labels as
// Maps on an iPhone, drawn into a page by Apple's script
// (cdn.apple-mapkit.com). It is not an OAuth connection and reads nothing
// of the reader's; the page asks this server for a short-lived token, and
// the token is what Apple's script shows Apple. The token is a JWT signed
// ES256 with a private key the owner downloads from the Apple Developer
// account (Certificates, Identifiers & Profiles → Keys → a key with MapKit
// JS enabled) — never the key itself to the page, only a 30-minute token.
//
// HONEST OFF. Without MAPKIT_TEAM_ID, MAPKIT_KEY_ID and MAPKIT_PRIVATE_KEY
// the route answers `enabled: false` with the reason and the map surfaces
// draw the schematic they always drew (FashionMap.jsx). Nothing pretends to
// be Apple.
// The Apple Developer Program ($99 a year) is the owner's signup; this file
// is everything that waits on it.
//
// No dependency: Node's crypto signs ES256 in the raw r‖s form a JWT needs.

import { createPrivateKey, sign, verify } from "node:crypto";

export const MAPKIT_SOURCE = "Apple MapKit JS";
/** Apple's script, the 5.x line (the current major; `5.x.x` is Apple's own
 *  "latest 5" alias, documented at developer.apple.com/documentation/mapkitjs). */
export const MAPKIT_SCRIPT = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
export const MAPKIT_TOKEN_TTL_S = 30 * 60;

export function mapkitEnabled() {
  return !!(process.env.MAPKIT_TEAM_ID && process.env.MAPKIT_KEY_ID && process.env.MAPKIT_PRIVATE_KEY);
}

/** Why the map is schematic right now — printed by the route, read by the admin board. */
export function mapkitReason() {
  const missing = ["MAPKIT_TEAM_ID", "MAPKIT_KEY_ID", "MAPKIT_PRIVATE_KEY"].filter((k) => !process.env[k]);
  return missing.length ? `Apple Maps needs ${missing.join(", ")} (an Apple Developer Program key with MapKit JS enabled)` : null;
}

const b64url = (input) => Buffer.from(input).toString("base64url");

/** The private key as the env carries it: a PEM, possibly with its newlines
 *  escaped as the two characters "\n" (how a dashboard pastes a .p8). */
export function pemFromEnv(value) {
  const s = String(value || "").trim().replace(/\\n/g, "\n");
  return s.includes("-----BEGIN") ? s : null;
}

/**
 * A MapKit JS token: ES256 JWT, `iss` the team, `kid` the key, 30 minutes.
 * `origin` restricts the token to one page origin when given (Apple refuses
 * it elsewhere) — MAPKIT_ORIGIN; unset, the token is short-lived and unbound.
 * Pure in its arguments; the route reads the env.
 */
export function mintMapkitToken({ teamId, keyId, privateKey, origin = null, now = Date.now(), ttlSeconds = MAPKIT_TOKEN_TTL_S }) {
  if (!teamId || !keyId || !privateKey) throw new Error("mintMapkitToken: teamId, keyId and privateKey are required");
  const pem = pemFromEnv(privateKey);
  if (!pem) throw new Error("MAPKIT_PRIVATE_KEY is not a PEM (-----BEGIN PRIVATE KEY-----)");
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ec") throw new Error("MAPKIT_PRIVATE_KEY is not an EC key (Apple issues P-256 .p8 keys)");
  const iat = Math.floor(now / 1000);
  const exp = iat + Math.max(60, Math.min(ttlSeconds | 0 || MAPKIT_TOKEN_TTL_S, 24 * 60 * 60));
  const header = { alg: "ES256", kid: String(keyId), typ: "JWT" };
  const payload = { iss: String(teamId), iat, exp, ...(origin ? { origin: String(origin) } : {}) };
  const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = sign("sha256", Buffer.from(signing), { key, dsaEncoding: "ieee-p1363" });
  return { token: `${signing}.${b64url(sig)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Read a token back (tests, the admin board): header, payload, and whether
 *  `publicKey` verifies it. Never trusts the token's own claims about itself. */
export function readMapkitToken(token, publicKey = null) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const verified = publicKey
    ? verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))
    : null;
  return { header, payload, verified };
}

/** The route's read: a token from the env, or the reason there is none. */
export function mapkitToken({ now = Date.now() } = {}) {
  if (!mapkitEnabled()) return { enabled: false, reason: mapkitReason() };
  const minted = mintMapkitToken({
    teamId: process.env.MAPKIT_TEAM_ID,
    keyId: process.env.MAPKIT_KEY_ID,
    privateKey: process.env.MAPKIT_PRIVATE_KEY,
    origin: process.env.MAPKIT_ORIGIN || null,
    now,
  });
  return { enabled: true, source: MAPKIT_SOURCE, script: MAPKIT_SCRIPT, ...minted };
}
