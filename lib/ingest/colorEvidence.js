// Conservative product-color verification. A color becomes a product tag
// only when the merchant explicitly states it and the actual listing images
// independently support it. Image-only guesses remain evidence, never facts.

import { readBytes } from "../security/http.js";
import { safeExternalUrl } from "../url.js";
import { dominantPalette } from "../vision/palette.js";

export const PRODUCT_COLORS = [
  "black", "white", "grey", "cream", "beige", "tan", "brown", "navy",
  "blue", "green", "olive", "burgundy", "red", "pink", "yellow",
  "orange", "purple", "silver", "gold",
];

const COLOR_SET = new Set(PRODUCT_COLORS);
const ALIASES = new Map([
  ["gray", "grey"], ["charcoal", "grey"], ["ivory", "cream"],
  ["off white", "cream"], ["off-white", "cream"], ["camel", "tan"],
  ["khaki", "tan"], ["wine", "burgundy"], ["maroon", "burgundy"],
  ["rose", "pink"], ["fuchsia", "pink"], ["lilac", "purple"],
  ["violet", "purple"], ["multicolor", "multi"], ["multi color", "multi"],
  ["multi-colour", "multi"],
]);

/**
 * A merchant's free-text colour ("Rose / Fuchsia", "multi-colour") reduced to
 * the canonical palette. Capped at four.
 *
 * READS WHAT THE MERCHANT SAID; it does not decide what colour the piece IS.
 * That is reconcileColorEvidence's job, and the separation is the whole point
 * — a merchant statement alone is a claim, not evidence.
 */
export function canonicalMerchantColors(value) {
  const text = String(value || "").toLowerCase().replace(/[_+]/g, " ");
  const found = [];
  const terms = text.split(/\s*(?:\/|,|;|\||\band\b|&|\bwith\b)\s*/).filter(Boolean);
  for (const raw of terms) {
    const term = raw.trim().replace(/\s+/g, " ");
    const direct = ALIASES.get(term) || term;
    if (COLOR_SET.has(direct) && !found.includes(direct)) found.push(direct);
    for (const color of PRODUCT_COLORS) {
      if (new RegExp(`(?:^|\\s)${color}(?:$|\\s)`).test(term) && !found.includes(color)) found.push(color);
    }
  }
  return found.slice(0, 4);
}

/**
 * DECIDE WHAT COLOUR A PIECE VERIFIABLY IS, by making the merchant's claim and
 * the product images agree.
 *
 * A colour is `verified` only if the merchant NAMED it AND enough images show
 * it — two when several images exist, one when only one does. Colours the
 * images show but the merchant never claimed stay in `observedColors` and are
 * never promoted; a photograph's palette includes the backdrop and the model.
 *
 * Three honest statuses: `verified`, `unverified` (claimed, uncorroborated)
 * and `merchant-color-missing`. Only the first is ever shown to a reader —
 * see ColorEvidenceLine.
 */
export function reconcileColorEvidence(merchantValue, imageColorSets = []) {
  const merchantColors = canonicalMerchantColors(merchantValue);
  const cleanSets = imageColorSets
    .filter(Array.isArray)
    .map((colors) => [...new Set(colors.filter((color) => COLOR_SET.has(color)))].slice(0, 4));
  const votes = Object.fromEntries(PRODUCT_COLORS.map((color) => [color, 0]));
  for (const colors of cleanSets) for (const color of colors) votes[color]++;
  const requiredVotes = cleanSets.length > 1 ? 2 : 1;
  const verifiedColors = merchantColors.filter((color) => votes[color] >= requiredVotes);
  const observedColors = Object.entries(votes).filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([color]) => color).slice(0, 6);
  const strongestVote = Math.max(0, ...verifiedColors.map((color) => votes[color]));
  return {
    status: verifiedColors.length ? "verified" : merchantColors.length ? "unverified" : "merchant-color-missing",
    merchantColors,
    observedColors,
    verifiedColors,
    imagesAnalyzed: cleanSets.length,
    imagesRequired: requiredVotes,
    confidence: verifiedColors.length ? Math.min(0.95, +(0.65 + strongestVote * 0.1).toFixed(2)) : 0,
    method: "merchant-statement+multi-image-palette-v1",
  };
}

function allowedImageHosts(product) {
  const hosts = new Set((process.env.INGEST_IMAGE_ALLOWED_HOSTS || "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (String(product.source_name || product.source || "").toLowerCase().includes("ebay")) {
    hosts.add("i.ebayimg.com");
  }
  try {
    const source = new URL(product.source_product_url || product.url || "");
    hosts.add(source.hostname.toLowerCase());
  } catch {}
  return hosts;
}

async function imageColors(url, allowedHosts) {
  const safe = safeExternalUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null;
  let response;
  try {
    response = await fetch(safe, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      redirect: "error", signal: AbortSignal.timeout(8_000),
    });
  } catch { return null; }
  if (!response.ok || !/^image\/(?:avif|webp|png|jpe?g)\b/i.test(response.headers.get("content-type") || "")) return null;
  let bytes;
  try { bytes = await readBytes(response, 8 * 1024 * 1024); } catch { return null; }
  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(bytes, { animated: false, failOn: "warning", limitInputPixels: 20_000_000 })
      .rotate().resize(64, 64, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return null;
    return dominantPalette(data, 5).filter((swatch) => swatch.weight >= 0.06)
      .map((swatch) => swatch.name).slice(0, 4);
  } catch { return null; }
}

/**
 * Establish one product's colour from the merchant's claim AND its images.
 *
 * NEVER TRUSTS EVIDENCE SUPPLIED BY AN ADAPTER — it recomputes at this
 * boundary, because a feed can assert anything and this is the last point
 * before the claim becomes a fact in the catalog. Images are fetched only from
 * hosts the product legitimately points at.
 */
export async function verifyProductColor(product) {
  // Never trust evidence supplied by an adapter/feed. Recompute from the
  // merchant's literal color field and fetched listing images at this boundary.
  const images = [...new Set((product.images || [product.img]).filter(Boolean))].slice(0, 3);
  const hosts = allowedImageHosts(product);
  const analyzed = (await Promise.all(images.map((url) => imageColors(url, hosts)))).filter(Boolean);
  const evidence = reconcileColorEvidence(product.merchantColor || product.merchant_color, analyzed);
  return {
    ...product,
    color: evidence.verifiedColors[0] || null,
    colors: evidence.verifiedColors,
    colorEvidence: evidence,
  };
}

/** verifyProductColor across a batch, bounded to `concurrency` in flight.
 *  The bound matters: an unbounded map over a large import would open a fetch
 *  per image at once and be indistinguishable from an attack on the merchant. */
export async function verifyProductColors(products = [], concurrency = 4) {
  const rows = [...products];
  const output = new Array(rows.length);
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const index = next++;
      output[index] = await verifyProductColor(rows[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), rows.length || 1) }, worker));
  return output;
}
