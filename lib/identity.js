import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getAuthenticatedUser } from "./supabase.js";

export const DEVICE_COOKIE = "asilum-device";
const DEV_DEVICE_SECRET = randomBytes(32).toString("hex");

function deviceSecret() {
  const value = process.env.DEVICE_COOKIE_SECRET || "";
  if (value.length >= 32) return value;
  return process.env.NODE_ENV === "production" ? null : DEV_DEVICE_SECRET;
}

function signature(uid, secret) {
  return createHmac("sha256", secret).update(uid).digest("hex");
}

export function newDeviceId() {
  return "u-" + randomUUID();
}

export function signedDeviceValue(uid) {
  const secret = deviceSecret();
  return secret ? uid + "." + signature(uid, secret) : null;
}

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
export function accountIdFromIdentity(uid) {
  if (typeof uid !== "string" || !uid.startsWith("sb-")) return null;
  const raw = uid.slice(3).toLowerCase();
  return AUTH_UUID.test(raw) ? raw : null;
}

// Resolve identity from proof, never from the caller's claimed user id alone.
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
