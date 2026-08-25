// lib/identity.js — WHO THE CALLER IS. The root of trust for the whole app.
//
// ADR-002 is binding here and has been violated before; read it before
// changing anything in this file.
//
// TWO KINDS OF IDENTITY, and the difference decides what a caller may own:
//
//   u-<uuid>   an ANONYMOUS DEVICE, proved by a signed HttpOnly cookie. Can
//              hold taste, boards and history. Can NEVER hold a social or
//              trust row — see accountIdFromIdentity, which returns null for
//              these on purpose.
//   sb-<uuid>  a REAL ACCOUNT, proved by a verified Supabase session. The
//              uuid after "sb-" IS auth.users.id; that substring relationship
//              is the mapping ADR-002 mandates, not an implementation detail
//              to be re-encoded somewhere else.
//
// THE LAW OF THIS FILE: identity comes from PROOF, never from what the caller
// says it is. A request that claims `user=sb-<someone-else>` gets null, not
// that user. resolveRequestUser is the only correct entry point for a route.
//
// Writing data for one identity and reading it back under the other is the
// specific bug this file exists to prevent: it presents as "my account looks
// empty" or, worse, as one person seeing another's shelf.

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getAuthenticatedUser } from "./supabase.js";

/** Cookie holding `<uid>.<hmac>`. HttpOnly: the browser never reads it. */
export const DEVICE_COOKIE = "asilum-device";
const DEV_DEVICE_SECRET = randomBytes(32).toString("hex");

/**
 * The HMAC key for device cookies, or null when there is none to be had.
 *
 * In production a missing or short DEVICE_COOKIE_SECRET returns null and every
 * device identity fails closed — unsigned cookies are never accepted. Outside
 * production it falls back to a per-process random secret, which is why
 * restarting the dev server logs every anonymous device out: the key it was
 * signed with is gone. That is intended, and is not a bug to "fix" by
 * persisting the dev secret.
 */
function deviceSecret() {
  const value = process.env.DEVICE_COOKIE_SECRET || "";
  if (value.length >= 32) return value;
  return process.env.NODE_ENV === "production" ? null : DEV_DEVICE_SECRET;
}

/** The HMAC that makes a device id unforgeable. */
function signature(uid, secret) {
  return createHmac("sha256", secret).update(uid).digest("hex");
}

/** Mint a fresh anonymous device id. The `u-` prefix is load-bearing. */
export function newDeviceId() {
  return "u-" + randomUUID();
}

/**
 * The cookie value for a device id: `<uid>.<hmac>`, or null if the deployment
 * has no signing secret. Null must be treated as "cannot issue an identity",
 * never as "issue an unsigned one".
 */
export function signedDeviceValue(uid) {
  const secret = deviceSecret();
  return secret ? uid + "." + signature(uid, secret) : null;
}

/**
 * The device id a request has actually PROVED it owns, or null.
 *
 * Rejects anything malformed before comparing, then compares in constant time.
 * Splits on the LAST dot because only the signature is fixed-format; parsing
 * from the front would let a crafted uid shift the boundary.
 *
 * Null means "no proven device" — it does not mean "new visitor". Do not mint
 * an id here; that belongs to /api/auth.
 */
export function verifiedDevice(req) {
  const secret = deviceSecret();
  const value = req.cookies.get(DEVICE_COOKIE)?.value || "";
  const dot = value.lastIndexOf(".");
  if (!secret || dot < 1) return null;
  const uid = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  if (!/^u-[0-9a-f-]{36}$/.test(uid) || !/^[0-9a-f]{64}$/.test(supplied)) return null;
  const expected = signature(uid, secret);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex")) ? uid : null;
}

// ADR-002: the sb-<uuid> ↔ auth.users.id mapping is the substring after
// "sb-". Social/trust domains key rows on the auth uuid; device (u-)
// identities can NEVER hold social rows, so this returns null for them.
const AUTH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * The bare auth uuid for an account identity, or null for anything else.
 *
 * Every social and trust table keys on THIS value — the bare uuid, not the
 * `sb-` prefixed string. Writing one and reading the other is the ADR-002
 * violation that has actually happened here: rows written under a device id
 * and read back under `sb-`, which presents as an account that looks empty.
 *
 * Returning null for a `u-` device is the point, not a gap: an anonymous
 * device has no account to own social rows with.
 */
export function accountIdFromIdentity(uid) {
  if (typeof uid !== "string" || !uid.startsWith("sb-")) return null;
  const raw = uid.slice(3).toLowerCase();
  return AUTH_UUID.test(raw) ? raw : null;
}

/**
 * THE ONLY CORRECT WAY A ROUTE LEARNS WHO IS CALLING. Resolve identity from
 * proof; the caller's claim is a hint about which proof to check, never
 * evidence in itself.
 *
 * A claimed `sb-` id is checked against the verified session and must match
 * exactly, so asking for someone else's id returns null rather than their
 * data. Anything else resolves to the signed device cookie and the claim is
 * ignored outright — including the stale id a first page load may still hold.
 *
 * Returns null for "cannot prove who this is". Routes must answer 401 on null
 * rather than falling back to the claim.
 */
export async function resolveRequestUser(req, claimed = "") {
  if (typeof claimed !== "string" || !claimed || claimed.length > 80) return null;
  if (claimed.startsWith("sb-")) {
    const authUser = await getAuthenticatedUser(req);
    const actual = authUser ? "sb-" + authUser.id : null;
    return actual === claimed ? actual : null;
  }
  // Anonymous callers are identified solely by the signed HttpOnly cookie.
  // The claimed id is deliberately ignored, including stale first-load ids.
  return verifiedDevice(req);
}
