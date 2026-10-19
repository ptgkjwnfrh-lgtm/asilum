// app/api/account/kind/route.js
// GET  → this account's kind + the capabilities it opens.
// POST → choose a kind. Chosen once at signup; changing it afterwards is an
//        admin act, not a self-serve toggle.
//
// WHY CHOOSING IS ONE-WAY HERE. The kind decides which surfaces exist, and the
// two accumulate different state: a business builds a storefront and a
// customer ledger, a passport builds a taste profile. Letting someone flip
// back and forth would mean either destroying the other side's state on every
// flip, or carrying two half-populated identities forever. The desk can change
// it — with a reason, into the ledger — which is the rare case this needs.

import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../lib/identity.js";
import { readJsonRequest } from "../../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../../lib/security/request.js";
import { accountKind, readAccountKind, setAccountKind } from "../../../../lib/db/accountKinds.js";
import { CAPABILITIES, DEFAULT_KIND, isAccountKind, normalizeKind } from "../../../../lib/accounts.js";

export const dynamic = "force-dynamic";

function payload(kind, chosen) {
  const k = normalizeKind(kind);
  return { kind: k, chosen, capabilities: CAPABILITIES[k] };
}

export async function GET(req) {
  // The claimed id is REQUIRED by resolveRequestUser — it returns null for an
  // empty one, and then verifies against the signed HttpOnly cookie and
  // ignores what was claimed. Passing nothing here silently made every caller
  // anonymous, which read as "nobody has chosen", which is the exact
  // downgrade this route is written to avoid. House convention: ?user=.
  const claimed = new URL(req.url).searchParams.get("user") || "";
  const user = await resolveRequestUser(req, claimed);
  // A signed-OUT reader is not an error, and is definitionally a passport:
  // ADR-002 §"Consequences" — a business account is impossible for a
  // signed-out user by construction, so there is nothing to look up.
  const accountId = user ? accountIdFromIdentity(user) : null;
  if (!accountId) return NextResponse.json(payload(DEFAULT_KIND, false));
  try {
    const stored = await readAccountKind(accountId);
    return NextResponse.json(payload(stored || DEFAULT_KIND, Boolean(stored)));
  } catch {
    // The store is unreadable. Say so instead of answering "passport" — a
    // silent downgrade would strip a business of its whole app and look like
    // a person who never chose. The shell holds its current nav on a 503.
    return NextResponse.json({ error: "account kind unavailable" }, { status: 503 });
  }
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 1024 });
  if (parsed.response) return parsed.response;
  // Body first: the claimed id lives in it, and resolveRequestUser needs it.
  const user = await resolveRequestUser(req, String(parsed.body?.user || ""));
  if (!user) {
    return NextResponse.json({ error: "identity required" }, { status: 401 });
  }
  // A device identity may not choose. It would be written under `u-<uuid>` and
  // read back under `sb-<uuid>` after adoption — the v37 defect. Refuse with
  // the same shape app/api/business/route.js uses for the same reason.
  const accountId = accountIdFromIdentity(user);
  if (!accountId) {
    return NextResponse.json({
      error: "an account kind rides on a signed-in account",
      note: "choose again once you are signed in — a device on its own is always a passport",
    }, { status: 403 });
  }
  const quota = await consumeRateLimit({
    scope: "account-kind", subject: requestSubject(req, accountId), limit: 10, windowMs: 60 * 60 * 1000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const kind = String(parsed.body?.kind || "");
  if (!isAccountKind(kind)) {
    return NextResponse.json(
      { error: "kind must be passport or business" }, { status: 400 });
  }

  try {
    const existing = await readAccountKind(accountId);
    if (existing && existing !== kind) {
      // Not 409-and-nothing: tell the caller what it actually is, so a client
      // that raced itself can settle on the truth rather than retrying.
      return NextResponse.json(
        { error: "this account has already chosen its kind", ...payload(existing, true) },
        { status: 409 });
    }
    if (existing === kind) return NextResponse.json(payload(existing, true));
    await setAccountKind(accountId, kind, { actor: "signup" });
    return NextResponse.json(payload(kind, true));
  } catch {
    return NextResponse.json({ error: "could not record the account kind" }, { status: 503 });
  }
}
