import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getAuthenticatedUser } from "./supabase.js";

export const DEVICE_COOKIE = "asilum-device";

function deviceSecret() {
  const value = process.env.DEVICE_COOKIE_SECRET || "";
  return value.length >= 32 ? value : null;
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
