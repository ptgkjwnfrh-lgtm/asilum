import { createHash, timingSafeEqual } from "node:crypto";
import { verifiedDevice } from "../identity.js";

export function bearerToken(req) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

export function secureTokenEqual(supplied, expected) {
  if (typeof supplied !== "string" || typeof expected !== "string" || !expected) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

// Public quotas must not trust forwarding headers supplied by the request.
// Signed device identities are stable without exposing an IP address. Routes
// that are intentionally usable before /api/auth share a conservative fallback
// bucket; paid integrations should require verifiedRequestSubject instead.
export function requestSubject(req) {
  return verifiedRequestSubject(req) || "unverified-public";
}

export function verifiedRequestSubject(req) {
  return verifiedDevice(req);
}
