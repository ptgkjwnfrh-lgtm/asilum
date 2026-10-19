// lib/taste/network.js — THE TASTE NETWORK's reading (V.2), pure.
// Derives, from the stored profile and the person's own boards, what each of
// the ten tags can PROVE about itself: manual (chosen here), inferred (saves
// and the brain's reading), curated (an affinity neighbour), or nothing. The
// route (app/api/taste) is a thin door over this so a test can hold it
// without next/server.

import { TAGS, TAG_AFFINITY } from "../brain/tags.js";
import { migrateProfile } from "../brain/index.js";
import { vizState } from "../brain/memory.js";

export const INFER_FLOOR = 0.08;
export const KEEP_FLOOR = 0.55;
export const EXPLORE_FLOOR = 0.5;

function tagCountsFromBoards(boards) {
  const counts = {};
  for (const t of TAGS) counts[t] = 0;
  for (const b of boards || []) {
    for (const it of b.items || []) {
      const tags = it && it.tags;
      if (!tags) continue;
      if (Array.isArray(tags)) { for (const t of tags) if (counts[t] !== undefined) counts[t]++; }
      else for (const t in tags) if (counts[t] !== undefined && tags[t] >= 0.3) counts[t]++;
    }
  }
  return counts;
}

export function buildNetwork(profile, boards) {
  const p = migrateProfile(profile || {});
  const viz = vizState(p);
  const manual = (p._meta && p._meta.manual) || {};
  const saves = tagCountsFromBoards(boards);
  const strong = new Set();
  const nodes = TAGS.map((tag) => {
    const weight = +((viz.weights[tag] || 0).toFixed(3));
    let kind = "none";
    const evidence = [];
    if (manual[tag]) {
      kind = "manual";
      const via = manual[tag + ":via"] || "keep";
      const verb = via === "reduce" ? "you reduced this" : via === "explore" ? "you chose to explore this" : "you chose this";
      evidence.push({ what: `${verb} on ${String(manual[tag]).slice(0, 10)}`, via });
    }
    if (saves[tag] > 0) {
      if (kind === "none") kind = "inferred";
      evidence.push({ what: `${saves[tag]} saved piece${saves[tag] === 1 ? "" : "s"} carr${saves[tag] === 1 ? "ies" : "y"} this tag` });
    }
    if (Math.abs(weight) >= INFER_FLOOR) {
      if (kind === "none") kind = "inferred";
      evidence.push({ what: weight > 0 ? `the brain's reading is ${weight.toFixed(2)} from what you opened, saved and passed` : `you have passed on this — reading ${weight.toFixed(2)}`, reading: true });
    }
    if (kind !== "none") strong.add(tag);
    return { tag, weight, kind, saves: saves[tag], evidence };
  });
  // curated neighbours: one affinity hop from a manual/inferred tag
  for (const n of nodes) {
    if (n.kind !== "none") continue;
    const via = [...strong].filter((s) => (TAG_AFFINITY[s] || {})[n.tag] >= 0.5 || (TAG_AFFINITY[n.tag] || {})[s] >= 0.5);
    if (via.length) { n.kind = "curated"; n.evidence.push({ what: `an editorial neighbour of ${via.join(" and ")}`, curated: true }); }
  }
  const edges = [];
  for (const a of TAGS) for (const b in TAG_AFFINITY[a] || {}) {
    if (a < b) edges.push({ a, b, w: TAG_AFFINITY[a][b] });
  }
  return { nodes, edges, undo: !!(p._meta && p._meta.tasteUndo), manualCount: Object.keys(manual).filter((k) => !k.includes(":")).length };
}

