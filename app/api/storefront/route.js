// Account-owned native Storefront API. Device identities are deliberately
// refused: storefront, inventory and fee obligations belong to an account.

import { NextResponse } from "next/server";

import {
  archiveStorefrontListing,
  createStorefront,
  createStorefrontListing,
  getStorefrontForOwner,
  StorefrontRefused,
  updateStorefront,
  updateStorefrontListing,
} from "../../../lib/db/production.js";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { STOREFRONT_TERMS_VERSION } from "../../../lib/storefront/contracts.js";
import { storefrontRuntimeFlags } from "../../../lib/storefront/flags.js";
import { readJsonRequest, withPrivateCache } from "../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

function authResponse(user) {
  if (!user) return NextResponse.json({ error: "authentication required", code: "AUTH_REQUIRED" }, { status: 401 });
  return NextResponse.json({
    error: "a signed-in account is required",
    code: "ACCOUNT_REQUIRED",
  }, { status: 403 });
}

function result(body, status = 200) {
  return NextResponse.json({ currentTermsVersion: STOREFRONT_TERMS_VERSION, ...body }, { status });
}

function refused(error) {
  if (error instanceof StorefrontRefused) {
    return NextResponse.json({
      error: error.message,
      code: error.code,
      currentTermsVersion: STOREFRONT_TERMS_VERSION,
    }, { status: error.status });
  }
  console.error("[storefront] request failed", error?.message || error);
  return NextResponse.json({ error: "storefront unavailable", code: "STOREFRONT_UNAVAILABLE" }, { status: 503 });
}

async function ownerFrom(req, claimed) {
  const user = await resolveRequestUser(req, String(claimed || ""));
  return { user, accountId: accountIdFromIdentity(user) };
}

async function handleGET(req) {
  const { searchParams } = new URL(req.url);
  const identity = await ownerFrom(req, searchParams.get("user"));
  if (!identity.accountId) return authResponse(identity.user);
  const quota = await consumeRateLimit({
    scope: "storefront-owner-read", subject: identity.user, limit: 120, windowMs: 60_000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    return result(await getStorefrontForOwner(identity.accountId));
  } catch (error) {
    return refused(error);
  }
}

async function handlePOST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 64 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const identity = await ownerFrom(req, body.user);
  if (!identity.accountId) return authResponse(identity.user);
  const quota = await consumeRateLimit({
    scope: "storefront-owner-write", subject: identity.user, limit: 60, windowMs: 60_000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  try {
    const flags = storefrontRuntimeFlags();
    if (!flags.surfaceEnabled) {
      throw new StorefrontRefused("STOREFRONT_DISABLED", "storefront writes are disabled", 503);
    }
    if (["create_listing", "update_listing", "archive_listing"].includes(body.action)
      && !flags.listingWritesEnabled) {
      throw new StorefrontRefused("LISTING_WRITES_DISABLED", "storefront listing writes are disabled", 503);
    }
    switch (body.action) {
      case "create_store":
        return result(await createStorefront({
          accountId: identity.accountId,
          name: body.name,
          slug: body.slug,
          description: body.description,
          imageUrl: body.imageUrl,
          bannerUrl: body.bannerUrl,
          acceptedTermsVersion: body.acceptedTermsVersion,
          accepted: body.accepted,
        }), 201);
      case "update_store":
        return result(await updateStorefront(identity.accountId, body));
      case "create_listing":
        return result(await createStorefrontListing(identity.accountId, body), 201);
      case "update_listing":
        return result(await updateStorefrontListing(identity.accountId, body.listingId, body));
      case "archive_listing":
        return result(await archiveStorefrontListing(identity.accountId, body.listingId, body.version));
      default:
        return NextResponse.json({ error: "unknown storefront action", code: "UNKNOWN_ACTION" }, { status: 400 });
    }
  } catch (error) {
    return refused(error);
  }
}

export const GET = withPrivateCache(handleGET);
export const POST = withPrivateCache(handlePOST);
