// lib/security/request.js — WHO IS ASKING, and how much they may ask for.
//
// Every rate limit, every quota and every admin gate in the app resolves
// through this file, which makes it one of the few modules where a
// misunderstanding becomes a security fault rather than a bug. Read the whole
// thing before changing any of it.
//
// There are two separate questions here and they must not be confused:
//
//   * IS THIS CALLER AUTHORISED?  -> bearerToken + secureTokenEqual, for the
//     admin token. A yes/no on a shared secret.
//   * WHICH BUCKET DOES THIS CALLER COUNT AGAINST?  -> requestSubject and
//     friends, for quotas. An identity, not a permission. A subject being
//     stable matters more than it being personally identifying — and it must
//     never be forgeable, because a forgeable subject means unlimited minting.
//
// THE ORDER OF TRUST, strongest first: a signed device identity, then a
// per-edge-caller subject derived from ONE platform-set header the deployment
// has explicitly named, then a single shared bucket everyone falls into. The
// fallback is deliberately a cliff, not a ladder of guesses — see
// trustedEdgeSubject for why a fallback chain is how a spoofable value gets
// trusted.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { verifiedDevice } from "../identity.js";

/**
 * The token out of an `Authorization: Bearer <token>` header, or `""`.
 *
 * Returns a string, never null, so callers can compare without a null check —
 * and `secureTokenEqual` rejects `""` against any real secret anyway.
 */
export function bearerToken(req) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

/**
 * Compare two secrets in constant time. Use this for EVERY token comparison;
 * `===` on a secret leaks its length and its matching prefix through timing.
 *
 * THE SHA-256 STEP IS NOT DECORATION — do not "simplify" it away.
 * `timingSafeEqual` THROWS when the two buffers differ in length, so feeding
 * it raw secrets both crashes on the common case and leaks the length it
 * refused to compare. Hashing first makes both sides exactly 32 bytes, so the
 * comparison is always defined and always takes the same time.
 *
 * An absent or empty `expected` returns false rather than matching, so a
 * deployment that forgot to configure a token is CLOSED, not open.
 */
export function secureTokenEqual(supplied, expected) {
  if (typeof supplied !== "string" || typeof expected !== "string" || !expected) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/** The one bucket every unidentified caller shares. See requestSubject. */
export const PUBLIC_SUBJECT = "unverified-public";
const MAX_HEADER_LEN = 64;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

/**
 * A per-caller subject derived from ONE platform-set header, and only when the
 * deployment explicitly declares which header that is.
 *
 * The rule above still holds — headers SUPPLIED BY THE REQUEST are not trusted.
 * What changes is narrow: a single header, named per environment, is. That
 * distinction is load-bearing, because Next.js does NOT sanitize this for us:
 * base-server.js does `req.headers['x-forwarded-for'] ??= socket.remoteAddress`,
 * which PRESERVES a client-supplied value. So on localhost, `next dev`, tests,
 * or any non-Vercel host, an IP header is fully attacker-controlled — and a
 * spoofable subject is far worse than a shared one, because it means
 * unlimited minting at one identity per forged header value.
 *
 * Hence: TRUSTED_EDGE_IP_HEADER defaults to EMPTY and this whole branch is
 * dead code until a deployment sets it. No auto-detection, no fallback chain
 * (a fallback chain is exactly how a spoofable value gets trusted), no
 * multi-value parsing.
 *
 * IPv6 is masked to a /64 before hashing: a residential subscriber is
 * delegated a whole /64, so keying on the full address would hand one ordinary
 * customer 2^64 distinct subjects — unlimited minting arrived at without
 * spoofing anything.
 *
 * The value is HMAC'd, never stored or logged raw. An unsalted digest of an
 * IPv4 address is not anonymization — the whole 2^32 space is minutes of
 * laptop time — so this uses a keyed hash with a rotatable salt, in its own
 * domain, separate from the device-id hashing used by the contributor ledgers.
 */
export function trustedEdgeSubject(req) {
  const header = (process.env.TRUSTED_EDGE_IP_HEADER || "").trim().toLowerCase();
  if (!header) return null;
  const salt = process.env.RATE_LIMIT_SUBJECT_SALT || "";
  if (salt.length < 32) return null; // never plain-hash an IP
  const raw = (req.headers.get(header) || "").trim();
  if (!raw || raw.length > MAX_HEADER_LEN || raw.includes(",")) return null;
  let normalized = null;
  if (IPV4_RE.test(raw)) {
    normalized = "ip4:" + raw;
  } else if (raw.includes(":") && IPV6_RE.test(raw)) {
    const groups = expandIPv6(raw);
    if (!groups) return null;
    normalized = "ip6:" + groups.slice(0, 4).join(":") + "::/64";
  }
  if (!normalized) return null;
  return "edge:" + createHmac("sha256", salt).update(normalized).digest("hex");
}

/** Expand an IPv6 address to eight 16-bit groups, or null if malformed. */
function expandIPv6(value) {
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  } else if (fill < 0) return null;
  const groups = halves.length === 1
    ? head
    : [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  return groups.map((g) => (g === "" ? "0" : g).toLowerCase().padStart(4, "0"));
}

// Public quotas must not trust forwarding headers supplied by the request.
// Signed device identities are stable without exposing an IP address — a
// verified device short-circuits before any IP is read, so the overwhelming
// majority of requests never touch one. Routes that are intentionally usable
// before /api/auth fall back to a per-edge-caller subject when the deployment
// declares a trusted header, and otherwise to a shared bucket; paid
// integrations should require verifiedRequestSubject instead.
/**
 * The quota bucket for a request that is allowed to happen before sign-in.
 *
 * Falls back rather than failing: a verified device if there is one, otherwise
 * a trusted-edge subject if the deployment declared a header, otherwise the
 * single shared PUBLIC_SUBJECT bucket. The last case means unidentified
 * callers contend with each other — accepted deliberately, because a shared
 * bucket only degrades service while a forgeable one removes the limit
 * entirely.
 *
 * TAKES ONE ARGUMENT. Passing a second (`requestSubject(req, me)`) is silently
 * ignored, which has happened, and the result was a per-user quota that was
 * really keyed on the device — every account on one device sharing one
 * allowance. If you want the caller's identity in the key, build the key at
 * the call site.
 *
 * For anything that costs money or reaches a paid integration, use
 * verifiedRequestSubject instead and refuse when it returns null.
 */
export function requestSubject(req) {
  return verifiedRequestSubject(req) || trustedEdgeSubject(req) || PUBLIC_SUBJECT;
}

/**
 * The signed device identity, or null when the request carries none.
 *
 * The strict half of the pair: null means "I cannot tell who this is", and a
 * caller that spends money on the answer should refuse rather than fall back.
 */
export function verifiedRequestSubject(req) {
  return verifiedDevice(req);
}
