// app/api/ebay/account-deletion/route.js
// eBay MARKETPLACE ACCOUNT DELETION / CLOSURE notifications — the endpoint
// every eBay Developers Program keyset must name (or opt out of) before its
// PRODUCTION keys are usable. eBay's page, read 10 Sep 2026: "All existing
// and new third-party developers integrated with eBay APIs via the eBay
// Developers Program are required to: 1) subscribe to eBay marketplace
// account deletion/closure notifications; or 2) follow the process to opt out".
//
// THE HANDSHAKE (GET). When the endpoint URL and a verification token are
// saved in the developer portal, eBay GETs <endpoint>?challenge_code=<code>
// and expects 200 + {"challengeResponse": sha256hex(code + token + endpoint)}
// — "hashed in the following order or the verification will fail:
// challengeCode + verificationToken + endpoint". The endpoint string hashed
// here MUST equal the URL typed into the portal, character for character:
// EBAY_DELETION_ENDPOINT if set, else SITE_ORIGIN + this route's path.
//
// THE NOTIFICATION (POST). ASILUM stores no eBay USER data: the Browse API is
// read with an application token and a listing carries a seller name at
// most, which normalizeEbayItem does not keep. There is nothing to delete, so
// a notification is acknowledged (eBay wants a 200/201/202/204) and counted,
// never parsed for a person's fields. If that ever changes — an eBay user
// identity stored anywhere — this handler must start deleting, and the
// notification signature (X-EBAY-SIGNATURE, eBay's Notification API public
// key) must be verified first.
//
// The token: 32–80 characters of letters, digits, underscore and hyphen (the
// portal's own rule). Unset or malformed = an honest 503, never a guess.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { SITE_ORIGIN } from "../../../../lib/site.js";

export const dynamic = "force-dynamic";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,80}$/;
const ROUTE_PATH = "/api/ebay/account-deletion";

export function deletionEndpoint() {
  return process.env.EBAY_DELETION_ENDPOINT || `${SITE_ORIGIN}${ROUTE_PATH}`;
}

function verificationToken() {
  const token = process.env.EBAY_DELETION_VERIFICATION_TOKEN || "";
  return TOKEN_SHAPE.test(token) ? token : null;
}

export function challengeResponseFor(challengeCode, token, endpoint) {
  return createHash("sha256").update(challengeCode).update(token).update(endpoint).digest("hex");
}

const idle = () => NextResponse.json(
  { error: "eBay account-deletion endpoint idle — set EBAY_DELETION_VERIFICATION_TOKEN (32–80 chars: letters, digits, _ -) in the environment" },
  { status: 503 }
);

export async function GET(req) {
  const token = verificationToken();
  if (!token) return idle();
  const code = new URL(req.url).searchParams.get("challenge_code") || "";
  if (!code || code.length > 256) return NextResponse.json({ error: "challenge_code required" }, { status: 400 });
  return NextResponse.json({ challengeResponse: challengeResponseFor(code, token, deletionEndpoint()) }, { status: 200 });
}

let acknowledged = 0;
export async function POST() {
  if (!verificationToken()) return idle();
  acknowledged += 1;
  // no eBay user data is held, so the acknowledgement IS the deletion
  return NextResponse.json({ acknowledged: true }, { status: 200 });
}
