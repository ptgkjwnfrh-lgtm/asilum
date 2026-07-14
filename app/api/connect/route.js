// app/api/connect/route.js
// POST /api/connect  { user, platform }
// Account linking. Real platform OAuth adapters plug in here (eBay Browse,
// Pinterest OAuth, Shopify Storefront). Until real credentials + adapters
// exist, this endpoint honestly reports the connection as unavailable —
// it must NOT simulate imported purchase history (see CONSTITUTION.md).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["ebay", "pinterest", "shopify"]);

// Env vars that would power each platform's real adapter, once built.
const ADAPTER_ENV = {
  ebay: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
  pinterest: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
  shopify: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_STOREFRONT_TOKEN"],
};

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const platform = String(body.platform || "").toLowerCase();
  if (!PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }

  const envNeeded = ADAPTER_ENV[platform];
  const hasCreds = envNeeded && envNeeded.every((k) => process.env[k]);
  const message = envNeeded
    ? hasCreds
      ? `${platform} credentials detected — the OAuth adapter isn't enabled yet. coming soon.`
      : `${platform} linking is coming soon — it requires real OAuth setup (${envNeeded.join(", ")}).`
    : `${platform} linking is coming soon — official API setup is required.`;

  return NextResponse.json(
    { error: "not_connected", platform, message },
    { status: 501 }
  );
}
