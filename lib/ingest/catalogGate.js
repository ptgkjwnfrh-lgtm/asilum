// lib/ingest/catalogGate.js — WHAT MAY ENTER THE CATALOG.
//
// Until today every row in `items` carried `source = 'Asilum synthetic seed'`:
// 915 invented pieces, and a brain whose popularity counters and co-engagement
// graph had therefore only ever read invented behaviour. Letting real
// marketplace listings in is the point of this module and also the risk. A
// marketplace is not a curated feed: the same search that returns a 1998
// Helmut Lang denim trucker returns a lot of twelve unsorted tees, a sewing
// pattern for a jacket, a dust bag, and a bootleg the seller admits to in the
// title. Anything admitted here becomes a row a person is shown, a row the
// brain learns a taste vector from, and a row the ticket flow will try to buy.
// So these are laws, not preferences, and each one returns the REASON it
// refused — the run report groups by it, which is how a hole in the lexicon or
// a new kind of junk becomes visible instead of becoming catalog.
//
// TWO STAGES, because the second one costs an API call. `summaryRefusal` reads
// the free search summary (title, image, price); only survivors get the item
// detail fetched. `catalogRefusal` reads the fully composed product afterwards.
// Both return a short slug, or null meaning admit.
//
// Pure: no db, no network. The one import with an opinion is refusalReason —
// THE checkout honesty gate (lib/purchasable.js) — because a piece the ticket
// flow would refuse has no business being presented as inventory. Same rule
// operator intake already applies at its own door (lib/ingest/intake.js).

import { refusalReason } from "../purchasable.js";
import { TAGS } from "../brain/tags.js";

export const MAX_PRICE = 100_000;
export const MIN_TITLE_LENGTH = 12;

// The seller's own words saying the piece is not what it is named after. A
// listing that admits this in its title is not an authenticity judgement we
// are making — it is one the seller already made.
const NOT_AUTHENTIC = /\b(bootleg|boot leg|replica|reproductions?|reprints?|knock ?offs?|fakes?|unauthoriz(?:ed|ing)|inspired by|in the style of|style of|not authentic|unbranded replica)\b/i;

// More than one garment, or a garment sold as stock rather than as a piece.
const LOT_OR_BUNDLE = /\blots? of\b|\bjob lot\b|\bbundles?\b|\bsets? of \d|\bwholesale\b|\bresell(?:er)? lot\b|\bmystery (?:box|bag)\b|\b\d+\s?(?:pcs?|pieces)\b|\bx\s?\d+\s?(?:pcs?|pieces)\b/i;

// Sold in the clothing category, but not a garment: the pattern, the paper, the
// display furniture, the picture of the thing. These are unambiguous as the
// SUBJECT of a title — nobody sells a coat and calls it a sewing pattern.
const NOT_A_GARMENT = /\b(sewing patterns?|dress ?forms?|mannequins?|garment racks?|clothes hangers?|swatch(?:es)?|fabric by the yard|yards? of fabric|lookbooks?|magazines?|catalogu?es?|postcards?|posters?|stickers?|key ?chains?|key ?rings?|gift ?cards?|empty box|box only|tags? only|labels? only|display stands?|store displays?|photographs?|press kits?)\b/i;

// The same words that name junk when the listing is selling them name a
// garment's EXTRAS when it is not: "comes with the original dust bag",
// "receipt included", "on its hanger". Only the word "only" (or "just the")
// tells the two apart, and a title is where that distinction is made.
const PACKAGING = /\b(dust ?bags?|shopping bags?|receipts?|authenticity cards?|care cards?|hang ?tags?|hangers?|boxes|box)\b/i;
const ONLY = /\bonly\b|\bjust the\b|\bno (?:jacket|coat|garment|item|clothing)\b/i;

// Made for the order rather than found: a different supply chain, a different
// availability, and on an archive search usually a reproduction.
const MADE_TO_ORDER = /\b(custom ?made|made to order|made to measure|handmade by me|we can make|any size available)\b/i;

const TITLE_LAWS = [
  ["seller-says-not-authentic", NOT_AUTHENTIC],
  ["lot-or-bundle", LOT_OR_BUNDLE],
  ["not-a-garment", NOT_A_GARMENT],
  ["made-to-order", MADE_TO_ORDER],
];

// "NOT a reproduction", "no bootlegs here", "this is not a replica" — honest
// sellers say the word in order to deny it, and a law that cannot hear the
// denial refuses the very listings it exists to protect. Anything inside the
// 40 characters before a hit that negates it clears that hit; the scan
// continues, so a listing that denies once and admits once is still refused.
const NEGATOR = /\b(?:not|never|no|none|isn'?t|ain'?t|aren'?t|unlike|excluding|rather than|instead of)\b[^.!?]{0,28}$/i;

function unnegated(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!NEGATOR.test(text.slice(Math.max(0, m.index - 40), m.index))) return m[0];
  }
  return null;
}

/**
 * The first law the TITLE breaks, or null. A title is what is being sold, so
 * all four laws read it.
 */
export function wordRefusal(text) {
  const value = String(text || "");
  for (const [reason, pattern] of TITLE_LAWS) {
    if (reason === "seller-says-not-authentic" ? unnegated(value, pattern) : pattern.test(value)) return reason;
  }
  if (PACKAGING.test(value) && ONLY.test(value)) return "not-a-garment";
  return null;
}

/**
 * The description is read for ONE law only: the seller's own admission that
 * the piece is not what it is named after.
 *
 * The other three would misread a body. "Comes with the original dust bag and
 * receipt" is a garment WITH packaging, not packaging; "bundle discount on 3+"
 * is a shop's offer, not a lot; "any size available" is boilerplate across a
 * seller's whole store. In a title those same words name the thing for sale,
 * which is why `wordRefusal` applies all four there and only this one here.
 */
export function authenticityRefusal(text) {
  return unnegated(String(text || ""), NOT_AUTHENTIC) ? "seller-says-not-authentic" : null;
}

/**
 * Stage one: the search summary, before a single detail call is spent.
 * `summary` is an eBay Browse itemSummary (shape-tolerant).
 */
export function summaryRefusal(summary = {}) {
  const title = String(summary.title || "").trim();
  if (title.length < MIN_TITLE_LENGTH) return "no-title";
  const word = wordRefusal(title);
  if (word) return word;
  if (!summary.image?.imageUrl && !summary.thumbnailImages?.[0]?.imageUrl) return "no-image";
  const price = Number(summary.price?.value);
  if (!Number.isFinite(price) || price <= 0) return "no-price";
  if (price > MAX_PRICE) return "price-out-of-range";
  return null;
}

/** Does the composed tag object give the brain anything to place the piece by? */
export function hasReadableTags(tags = {}) {
  for (const [key, value] of Object.entries(tags || {})) {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight < 0.1) continue;
    if (TAGS.includes(key)) return true;          // a canonical aesthetic
    if (key === key.toLowerCase()) return true;    // a descriptor
  }
  return false;
}

/**
 * The era, only if the listing gave evidence for it.
 *
 * guessEra falls back to `{ decade: "2020s", raw: null }` when a title carries
 * no year, no season code and no "90s" — an assumption, and harmless while it
 * stays a guess. Written into the catalog it becomes a fact: a decade tag at
 * confidence 0.6 on every undated listing, a 2020s filter that returns the
 * whole archive, and a brain learning an era from a coin flip. `raw` is the
 * evidence marker — the matched text, or null when nothing matched.
 */
export function eraWithEvidence(era) {
  return era && typeof era === "object" && era.raw ? era : null;
}

/**
 * Stage two: the normalized product, after the detail read and the compose.
 * Returns a reason slug or null. The checkout gate's own sentence rides along
 * as `checkout-would-refuse:<sentence>` so the report says which rule spoke.
 */
export function catalogRefusal(product = {}) {
  const title = String(product.title || "").trim();
  if (title.length < MIN_TITLE_LENGTH) return "no-title";
  const word = wordRefusal(title);
  if (word) return word;
  // The description is read HERE and not at stage one because we did not have
  // it then: a seller who keeps "reproduction" out of the title often puts it
  // in the body.
  const admitted = authenticityRefusal(product.description);
  if (admitted) return admitted;
  if (!product.img) return "no-image";
  if (!product.source_product_url && !product.url) return "no-source-url";
  if (!product.source_product_id) return "no-source-id";
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return "no-price";
  if (price > MAX_PRICE) return "price-out-of-range";
  if (!hasReadableTags(product.tags)) return "untagged";
  const refusal = refusalReason(product);
  if (refusal) return `checkout-would-refuse:${refusal}`;
  return null;
}
