// lib/images/cardsize.js — A CARD'S PHOTO AT A CARD'S SIZE (30 Oct 2026, the owner on an iPhone: "its just really slow
// and laggy"). The listings' photos are eBay's 1600px originals (2.56 megapixels each) drawn at about 260 CSS px: ten
// times the pixels a phone shows, every one decoded and held as the Feed scrolls. eBay serves the same photo at fixed
// sizes by the URL's s-l<px> name; a card asks for CARD_PX, enough for its width at a phone's 3x. Anything that is not
// an eBay image of that shape, or already as small, is returned as it came.

export const CARD_PX = 800;
const EBAY = /^(https:\/\/i\.ebayimg\.com\/images\/g\/[^/]+\/s-l)(\d+)(\.(?:jpe?g|png|webp))$/i;

export function cardImage(src, px = CARD_PX) {
  if (typeof src !== "string") return src;
  const m = src.match(EBAY);
  if (!m || Number(m[2]) <= px) return src;
  return m[1] + px + m[3];
}
