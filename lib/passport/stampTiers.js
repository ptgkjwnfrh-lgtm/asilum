// lib/passport/stampTiers.js — THE STAMP BOARDS' SIZES (owner, 3 Nov 2026: "i want some stamps bigger than
// others like the feed just to make it interesting but i want there to be 4 sizes of stamp group and they only
// range to 20% bigger"). Four tiers, the smallest the board's own size and the largest a fifth taller —
// 1, 1 + ¹⁄₁₅, 1 + ²⁄₁₅, 1.2 — so the masonry breathes without one board shouting. A board's tier is its rank
// by how many stamps it holds (the fullest quarter the largest), ties kept in the boards' order, so the same
// boards always draw the same page. Pure — app/components/StampsView.jsx and PageSheet.jsx read it.

export const TIER_SCALES = Object.freeze([1, 1 + 0.2 / 3, 1 + 0.4 / 3, 1.2]);

/** counts: the stamps on each board, in the boards' order → each board's tier, 0 (smallest) … 3 (largest). */
export function stampTiers(counts) {
  const n = counts.length;
  const order = counts.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c || a.i - b.i);
  const tiers = new Array(n);
  order.forEach(({ i }, rank) => { tiers[i] = 3 - Math.min(3, Math.floor((rank * 4) / Math.max(1, n))); });
  return tiers;
}
