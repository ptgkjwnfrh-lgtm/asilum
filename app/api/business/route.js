// app/api/business/route.js — the passport → business upgrade (owner
// law, Aug 13). A brand VERIFIES itself: it submits its brand name, its
// Shopify storefront domain, and its personal website; the submission
// opens a real brand_cases verification case and a HUMAN review decides
// it (the enforced machine has no path to business without a named
// reviewer and https evidence). Only business accounts get a chance at
// a hotlist booth. Shopify OAuth deepens the connection once the
// commerce pipeline has keys — the review is real today, the token
// exchange is not, and nothing here pretends otherwise.
//
// GET  ?booths=1                → public booth roster (no auth)
// GET  ?user=<uid>              → my account state (verified identity)
// POST { user, brandName, shopifyDomain, websiteUrl, statement? }
//      → submit/refresh the application (signed-in accounts only)

import { NextResponse } from "next/server";
import {
  getBusinessAccount, submitBusinessApplication, listVerifiedBusinesses,
  createModerationTask,
} from "../../../lib/db/production.js";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { normalizeShopifyDomain, validBrandName, STATEMENT_MAX } from "../../../lib/business.js";
import { domainToken } from "../../../lib/brands/verify.js";
import { sanitizeStatement } from "../../../lib/profile/rooms.js";
import { safeExternalUrl } from "../../../lib/url.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { requestSubject } from "../../../lib/security/request.js";

function publicView(row) {
  return {
    status: row.status,
    brandName: row.brandName,
    websiteUrl: row.websiteUrl,
    shopifyDomain: row.shopifyDomain,
    statement: row.statement,
    reviewNote: row.reviewNote,
    sourceName: row.sourceName || null,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quota = await consumeRateLimit({ scope: "business-read", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  if (searchParams.get("booths") === "1") {
    // The roster is public — a booth is a public storefront. Account
    // ids are not.
    const verified = await listVerifiedBusinesses(10).catch(() => []);
    return NextResponse.json({
      booths: verified.map((b) => ({
        brandName: b.brandName, websiteUrl: b.websiteUrl, verifiedAt: b.decidedAt,
        // The inventory namespace, when linked — a booth's pieces are
        // discoverable through it. A slug, never an account id.
        sourceName: b.sourceName || null,
      })),
      open: Math.max(0, 10 - verified.length),
      total: 10,
    });
  }

  const user = await resolveRequestUser(req, String(searchParams.get("user") || "")).catch(() => null);
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const accountId = accountIdFromIdentity(user);
  if (!accountId) {
    // A device identity is a passport without an account under it — the
    // upgrade rides on a signed-in account, and the UI says so.
    return NextResponse.json({ status: "passport", account: false });
  }
  const row = await getBusinessAccount(accountId).catch(() => null);
  // The domain-proof token rides on the account, application or not, so an
  // applicant can place it BEFORE submitting. Proof is placement on the
  // claimed domain — the token itself is not a secret (lib/brands/verify.js).
  const verifyToken = domainToken(accountId);
  if (!row) return NextResponse.json({ status: "passport", account: true, verifyToken });
  return NextResponse.json({ ...publicView(row), account: true, verifyToken });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const accountId = accountIdFromIdentity(user);
  if (!accountId) {
    return NextResponse.json({
      error: "business accounts ride on a signed-in account",
      note: "sign in first — the passport under your account is what gets raised",
    }, { status: 403 });
  }
  const quota = await consumeRateLimit({ scope: "business", subject: user, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const brandName = validBrandName(body.brandName);
  if (!brandName) return NextResponse.json({ error: "brand name must be 2-80 characters" }, { status: 400 });
  const shopifyDomain = normalizeShopifyDomain(body.shopifyDomain);
  if (!shopifyDomain) {
    return NextResponse.json({ error: "shopify domain must look like your-shop.myshopify.com" }, { status: 400 });
  }
  const websiteUrl = safeExternalUrl(String(body.websiteUrl || ""));
  if (!websiteUrl) return NextResponse.json({ error: "website must be a public https url" }, { status: 400 });
  let statement = null;
  if (body.statement) {
    try {
      statement = sanitizeStatement(String(body.statement).slice(0, STATEMENT_MAX), STATEMENT_MAX) || null;
    } catch {
      return NextResponse.json({ error: "statement could not be sanitized" }, { status: 400 });
    }
  }

  try {
    const row = await submitBusinessApplication({ accountId, brandName, websiteUrl, shopifyDomain, statement });
    // The review queue is real: every application files a task a human
    // works through. Approval is a named decision, never a machine's.
    await createModerationTask({
      kind: "business-verification", subjectType: "business_account", subjectId: accountId,
      payload: { brandName, websiteUrl, shopifyDomain, caseId: row.caseId }, priority: "high",
    }).catch(() => {});
    return NextResponse.json({
      ...publicView(row),
      note: "submitted — a human reviews every application; your account stays a passport until the review lands",
    });
  } catch (error) {
    if (String(error?.message || "").includes("already a business account")) {
      return NextResponse.json({ error: "this account is already a business account" }, { status: 409 });
    }
    return NextResponse.json({ error: "application could not be saved" }, { status: 500 });
  }
}
