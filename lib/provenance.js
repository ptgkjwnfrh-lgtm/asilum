// lib/provenance.js — DOES ANYBODY BACK THIS, OR DID A SELLER SAY IT?
//
// Owner ruling, 27 August 2026, on Taobao and every marketplace like it:
// **ingest it, label it, do not hide it.** This module is that ruling as one
// function, so the answer cannot differ between two surfaces.
//
// THE THING BEING LABELLED IS NOT QUALITY. A marketplace piece is not worse
// than a merchant one — it is LESS KNOWN, and that is a different claim. A
// Taobao listing that says "Balenciaga" is a seller typing a word. A piece
// from a merchant we hold an agreement with is a name somebody stands behind.
// Both may be shown. Only one may be presented as fact.
//
// THIS IS ASTERISK'S FIRST LAW AT THE CATALOG BOUNDARY. ASTERISK may only
// reason from what it can point at, so a brand it cannot back is recorded as a
// CLAIM and never as a fact — see `brandIsClaim` below, which is what stops an
// unverified word being scored as though it were verified.
//
// VERIFICATION IS EARNED, SO THE DEFAULT IS "UNVERIFIED". An unrecognised
// source is not given the benefit of the doubt; a source only counts as backed
// when it appears in AUTHORIZED_SOURCES because a real agreement exists. That
// direction matters: the failure mode of guessing "verified" is telling a
// reader something is genuine when nobody checked.
//
// Client-safe: pure, no database, no imports beyond lib/url.

import { safeExternalUrl } from "./url.js";

/** A piece nobody backs, because it is not real inventory at all. */
export const DEMO = "demo";
/** Real inventory, from a source under a real agreement. */
export const VERIFIED = "verified";
/** Real inventory whose brand is the SELLER'S CLAIM. The default. */
export const UNVERIFIED = "unverified";

/**
 * Sources under an agreement that makes the seller who they say they are.
 *
 * A merchant grants Storefront access, or approves ASILUM explicitly. That is
 * a person accepting terms, which is what "verified" means here — it is NOT a
 * claim that any individual garment has been authenticated. Nothing in ASILUM
 * authenticates a garment.
 */
const AUTHORIZED_SOURCES = new Set(["shopify", "woocommerce"]);

/**
 * Marketplaces and proxies. Anyone may list anything, so the brand on the
 * listing is a claim. Named explicitly for the reader's sake — "listed on
 * Taobao" is a more useful sentence than "unverified source".
 */
const MARKETPLACE_SOURCES = new Map([
  ["taobao", "Taobao"],
  ["yahoo-auctions", "Yahoo! JAPAN Auctions"],
  ["mercari", "Mercari Japan"],
  ["rakuma", "Rakuma"],
  ["buyee", "Buyee"],
  ["zenmarket", "ZenMarket"],
  ["ebay", "eBay"],
]);

const key = (item) =>
  String(item?.source_name ?? item?.source ?? "").trim().toLowerCase();

/** Nothing real behind it: no live link, or a source that names itself a seed. */
function looksSynthetic(item) {
  const url = safeExternalUrl(item?.source_product_url || item?.url);
  if (!url) return true;
  const name = key(item);
  return !name || name.includes("seed") || name.includes("demo") || name.includes("synthetic");
}

/**
 * What backs this piece: `{ status, sourceLabel, brandIsClaim, note }`.
 *
 * `brandIsClaim` is the field with teeth. When it is true the brand on the
 * record is a seller's word, and no surface may present it as established —
 * not the UI, and not ASTERISK's scoring.
 *
 * `note` is the sentence to SHOW. It is never null for an unlabelled state,
 * because the ruling is that this is not hidden.
 */
export function originEvidence(item) {
  if (!item) {
    return { status: DEMO, sourceLabel: null, brandIsClaim: true,
      note: "no record" };
  }
  if (looksSynthetic(item)) {
    return { status: DEMO, sourceLabel: null, brandIsClaim: true,
      note: "sample record — not real inventory, not for sale" };
  }
  const name = key(item);
  if (AUTHORIZED_SOURCES.has(name)) {
    return { status: VERIFIED, sourceLabel: item.source || item.source_name,
      brandIsClaim: false,
      note: "listed by a merchant under agreement with ASILUM" };
  }
  const marketplace = MARKETPLACE_SOURCES.get(name);
  return {
    status: UNVERIFIED,
    sourceLabel: marketplace || item.source || item.source_name || null,
    brandIsClaim: true,
    note: marketplace
      ? `unverified origin — listed on ${marketplace} by a seller. `
        + "The brand is their description, not a fact ASILUM has checked."
      : "unverified origin — the brand is the seller's description, "
        + "not a fact ASILUM has checked.",
  };
}

/** Shorthand: may this piece's brand be treated as established? */
export function brandIsEstablished(item) {
  return originEvidence(item).status === VERIFIED;
}
