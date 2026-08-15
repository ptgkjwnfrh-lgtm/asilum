// lib/brain/stylist.js
// THE STYLIST — a branch of the brain that assembles full outfits.
// Consumes the same flat tag vectors as every bridge, plus category, era and
// the size brain. An outfit is slots (outer/top/bottom/footwear/accessory)
// chosen to maximize: taste match (the blended taste vector) AND internal
// coherence (tag affinity between pieces, era proximity, price-tier sanity),
// filtered through fitScore so we never confidently propose something that
// won't fit.
//
// "conf" is a calibrated *display* of relative score (58–99). It is a ranking
// signal that sharpens as the profile accumulates interactions — not a
// literal purchase probability. Keep it honest in the UI copy.

import { tagSim } from "./tags.js";
import { vecSim } from "./bridges.js";
import { fitScore, fitPhrase } from "./sizing.js";

// Slot map over the catalog's canonical categories.
const SLOTS = {
  outer: ["outerwear"],
  top: ["tops", "knitwear", "tailoring"],
  bottom: ["bottoms"],
  foot: ["footwear"],
  acc: ["accessories"],
};

// A dress fills top+bottom in one move (womens/unisex looks).
const DRESS_FILLS = ["top", "bottom"];

function dominantTag(item) {
  let best = null, bestV = 0;
  for (const k in (item.tags || {})) if (item.tags[k] > bestV) { bestV = item.tags[k]; best = k; }
  return best;
}

function tagAffinity(a, b) {
  if (!a || !b) return 0.2;
  const s = tagSim(a, b);
  return s > 0 ? s : 0.1;
}

function eraYear(item) {
  const e = item.era || {};
  if (e.year) return e.year;
  if (e.decade) { const m = String(e.decade).match(/\d{4}/) || String(e.decade).match(/(\d{2})s/); if (m) return m[0].length === 4 ? +m[0] : 1900 + +m[1]; }
  return 2018; // neutral modern default
}

function priceTier(p) { if (p == null) return 1; if (p < 150) return 0; if (p < 500) return 1; if (p < 1500) return 2; return 3; }

// Pairwise coherence between two chosen pieces (0..1).
export function pairCoherence(a, b) {
  const aff = tagAffinity(dominantTag(a), dominantTag(b));
  const eraGap = Math.min(Math.abs(eraYear(a) - eraYear(b)), 40) / 40;   // 0 same-era .. 1 forty yrs apart
  const tierGap = Math.min(Math.abs(priceTier(a.price) - priceTier(b.price)), 3) / 3;
  return aff * 0.55 + (1 - eraGap) * 0.25 + (1 - tierGap) * 0.20;
}

// Score one candidate against the taste vector + already-chosen pieces (+ fit).
function candidateScore(item, taste, chosen, fitProfile) {
  const match = vecSim(item.tags || {}, taste);
  const coh = chosen.length
    ? chosen.reduce((s, c) => s + pairCoherence(item, c), 0) / chosen.length
    : 0.6;
  let fit = 0.5;
  if (fitProfile && item.size) {
    const fs = fitScore(item.size, fitProfile);           // sizing brain
    if (typeof fs === "number") fit = fs;
  }
  // `phrase` is deliberately NOT computed here (audit #17). fitPhrase runs the
  // whole fitAssessment a SECOND time — the measured 2:1 ratio of
  // fitAssessment to candidateScore calls was this line — and the phrase is
  // read only for the piece that wins its slot, which is <0.6% of candidates.
  // buildOutfit fills it in for the winner, under the same condition.
  return { score: match * 0.40 + coh * 0.40 + fit * 0.20, taste: match, coh, fit, phrase: null };
}

// Build ONE outfit. opts = { anchor, fitProfile, withOuter, events }
export function buildOutfit(pool, taste = {}, opts = {}) {
  const fitProfile = opts.fitProfile || null;
  const chosen = [];
  const detail = [];
  const used = new Set();

  if (opts.anchor) { chosen.push(opts.anchor); used.add(opts.anchor.id); }

  const wantSlots = ["top", "bottom", "foot"];
  if (opts.withOuter !== false) wantSlots.unshift("outer");
  wantSlots.push("acc");

  // If the anchor already occupies a slot, don't fill it twice.
  const slotOf = (it) => Object.keys(SLOTS).find((s) => SLOTS[s].includes(it.category)) ||
                         (it.category === "dresses" ? "dress" : null);
  const filled = new Set(chosen.map(slotOf));
  if (filled.has("dress")) DRESS_FILLS.forEach((s) => filled.add(s));

  for (const slot of wantSlots) {
    if (filled.has(slot)) continue;
    // dresses may claim the "top" turn and consume bottom too
    const cats = slot === "top" ? [...SLOTS.top, "dresses"] : SLOTS[slot];
    const cands = pool.filter((it) => cats.includes(it.category) && !used.has(it.id));
    if (!cands.length) continue;
    let best = null;
    for (const c of cands) {
      const s = candidateScore(c, taste, chosen, fitProfile);
      // fit gate: never pick a confidently-bad fit when we know measurements
      if (fitProfile && s.fit < 0.25) continue;
      if (!best || s.score > best.s.score) best = { c, s };
    }
    if (!best) continue;
    // The winner earns its fit phrase; the candidates it beat do not.
    if (fitProfile && best.c.size) best.s.phrase = fitPhrase(best.c.size, fitProfile);
    chosen.push(best.c); used.add(best.c.id); detail.push(best);
    filled.add(slot);
    if (best.c.category === "dresses") DRESS_FILLS.forEach((x) => filled.add(x));
  }

  const cohAvg = detail.length ? detail.reduce((s, d) => s + d.s.coh, 0) / detail.length : 0.5;
  const tasteAvg = detail.length ? detail.reduce((s, d) => s + d.s.taste, 0) / detail.length : 0;
  const events = opts.events || 0;
  const raw = cohAvg * 0.55 + Math.max(tasteAvg, 0) * 0.45;
  // Match floor is 75: below that a look never ships (product rule).
  const conf = Math.round(Math.min(99, Math.max(75, 75 + raw * 24 + Math.min(events, 400) / 100)));

  const dom = dominantTag({ tags: chosen.reduce((v, it) => { for (const k in it.tags||{}) v[k]=(v[k]||0)+it.tags[k]; return v; }, {}) });
  return {
    items: chosen,
    conf,
    curated: Math.round(cohAvg * 100),
    tasteStat: Math.round(Math.max(0, tasteAvg) * 100),
    total: chosen.reduce((s, it) => s + (it.price || 0), 0),
    dominantTag: dom,
    fitNotes: detail.map((d) => d.s.phrase).filter(Boolean),
    why: `coherence ${cohAvg.toFixed(2)} · taste ${tasteAvg.toFixed(2)}${fitProfile ? " · fit-gated" : ""}`,
  };
}

// Build a slate of n outfits with diversity between them (no repeated anchor tag).
export function buildSlate(pool, taste = {}, n = 3, opts = {}) {
  const out = [];
  const usedDom = new Set();
  const usedIds = new Set();
  for (let i = 0; i < n * 2 && out.length < n; i++) {
    // Keep slates distinct: exclude pieces already used by accepted outfits
    // (except the shared anchor).
    const subPool = pool.filter((it) => !usedIds.has(it.id));
    const fit = buildOutfit(subPool, taste, { ...opts, withOuter: i % 3 !== 2 });
    if (fit.items.length < 3) continue;
    if (usedDom.has(fit.dominantTag) && i < n) continue;  // push variety first pass
    usedDom.add(fit.dominantTag);
    for (const it of fit.items) if (!opts.anchor || it.id !== opts.anchor.id) usedIds.add(it.id);
    out.push(fit);
  }
  return out;
}
