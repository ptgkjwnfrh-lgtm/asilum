// lib/brands/verify.js
// Domain-control proof for business verification (Feature G's missing
// evidence collector). SERVER-ONLY.
//
// THE LAW THIS PRESERVES (schema-v18, lib/brands/cases.js): there is NO
// machine path to a verified badge. This module only GATHERS evidence —
// "the token for account X is served by the claimed domain" — which a named
// human attaches when deciding the case. It never moves a case itself.
//
// The token is deliberately secretless: proof is PLACEMENT on the claimed
// domain, not token secrecy. An impersonator can know the token; they
// cannot put it on the real brand's site.

import crypto from "node:crypto";
import { safeExternalUrl } from "../url.js";

const FETCH_CAP_BYTES = 512 * 1024;
const META_RE = (token) =>
  new RegExp(`<meta[^>]+name=["']asilum-verify["'][^>]+content=["']${token}["']|<meta[^>]+content=["']${token}["'][^>]+name=["']asilum-verify["']`, "i");

/** The verification token a brand must publish to prove it controls a domain.
 *  Derived from the account id, so it is stable across attempts and cannot be
 *  claimed by another account. */
export function domainToken(accountId) {
  const id = String(accountId || "").trim();
  if (!id) return null;
  return "asilum-verify-" + crypto.createHash("sha256").update(id).digest("hex").slice(0, 16);
}

/**
 * Does the fetched page actually carry this token?
 *
 * `requireMeta` demands a proper `<meta name="asilum-verify">` tag rather than
 * the token appearing anywhere in the body — the strict mode, because a token
 * echoed inside user-generated content on a page proves nothing about who
 * controls it.
 */
export function tokenAppearsIn(text, token, { requireMeta = false } = {}) {
  if (typeof text !== "string" || !token) return false;
  if (requireMeta) return META_RE(token).test(text);
  return META_RE(token).test(text) || text.includes(token);
}

async function fetchCapped(url, fetchImpl) {
  const res = await fetchImpl(url, { redirect: "follow", headers: { "User-Agent": "asilum-verify/1" } });
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > FETCH_CAP_BYTES ? text.slice(0, FETCH_CAP_BYTES) : text;
}

// Checks, in order: the site root for the meta tag, the well-known file for
// the bare token, and the myshopify root for the meta tag (theme-editable).
// Every URL passes the public-hostname guard; failures are refusals, never
// throws. Result is a REPORT for the human reviewer, not a state change.
export async function checkDomainProof({ websiteUrl, shopifyDomain, accountId, fetchImpl = fetch }) {
  const token = domainToken(accountId);
  if (!token) return { token: null, found: false, checked: [], reason: "no account id" };
  const candidates = [];
  const site = safeExternalUrl(String(websiteUrl || ""));
  if (site) {
    candidates.push({ url: site, requireMeta: true, method: "meta tag on site root" });
    const wellKnown = site.replace(/\/+$/, "") + "/.well-known/asilum-verify.txt";
    if (safeExternalUrl(wellKnown)) candidates.push({ url: wellKnown, requireMeta: false, method: "well-known file" });
  }
  const shop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(shopifyDomain || ""))
    ? safeExternalUrl(`https://${shopifyDomain}`)
    : null;
  if (shop) candidates.push({ url: shop, requireMeta: true, method: "meta tag on shopify storefront" });

  const checked = [];
  for (const candidate of candidates) {
    let body = null;
    try {
      body = await fetchCapped(candidate.url, fetchImpl);
    } catch {
      body = null;
    }
    checked.push(candidate.url);
    if (body && tokenAppearsIn(body, token, { requireMeta: candidate.requireMeta })) {
      return { token, found: true, method: candidate.method, url: candidate.url, checked };
    }
  }
  return { token, found: false, checked };
}
