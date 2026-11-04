// app/api/passport/stamps/route.js — THE STAMPS the server reads (lib/passport/milestones.js, read:
// "server"), for the Passport's visa page and its space zone.
// GET ?home=<base city's country>  → { stamps: { [id]: { earned, at, evidence, waits? } } }
// The base city is the passenger's own confirmed one (lib/location.js, kept on the device), sent for the
// international stamp alone and never stored. Every read is the passenger's own records: what was bought
// (lib/orders/bought.js — one definition with the purchase globe) and the wardrobe offers paid as the buyer.
// A source that cannot be read (no schema, no database) reads as nothing earned, never as an error page.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../../lib/identity.js";
import { withPrivateCache } from "../../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { boughtPieces } from "../../../../lib/orders/bought.js";
import { listWardrobeOffers } from "../../../../lib/db/production/money.js";
import { readMilestones } from "../../../../lib/passport/milestones-read.js";

export const dynamic = "force-dynamic";
const epoch = (v) => { const n = new Date(v).getTime(); return Number.isFinite(n) ? n : null; };

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, String(searchParams.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required", code: "AUTH_REQUIRED" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "stamps-read", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const home = String(searchParams.get("home") || "").slice(0, 80);
  const [bought, offers] = await Promise.all([
    boughtPieces(user).catch(() => ({ purchases: [] })),
    listWardrobeOffers({ buyerId: user, limit: 200 }).catch(() => []),
  ]);
  const wardrobePaid = offers.filter((o) => o.state === "paid").map((o) => ({ itemId: o.itemId, at: epoch(o.respondedAt || o.createdAt) }));
  return NextResponse.json({ stamps: readMilestones({ purchases: bought.purchases, wardrobePaid, home }) });
}

export const GET = withPrivateCache(handleGET);
