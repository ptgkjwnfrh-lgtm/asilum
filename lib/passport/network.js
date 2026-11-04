// lib/passport/network.js — THE NETWORK's model (app/components/TasteNetwork.jsx draws it): the nodes and
// the edges of everything a passenger kept, laid out in three dimensions round YOU. Pure — no DOM, no fetch —
// so the one law that matters here is testable: every edge says something true.
//   weight    YOU → a tag: the brain's reading of it (/api/taste nodes), drawn when |weight| > 0.04
//   curated   tag ↔ tag: the editorial affinity (TAG_AFFINITY, or the API's copy of it), w ≥ 0.3
//   carries   a save or a piece → a tag it carries (the save record's / the item's own `tags`)
//   member    a save → its kind, a kind → YOU, a piece → its board, a board → YOU
//   earned    a stamp → YOU, for an earned stamp only
// Nothing is inferred to draw a line: a save that carries none of the ten tags hangs off its kind alone.
// Positions are seeded by id, so the same passport draws the same shape every opening.

import { TAGS, TAG_AFFINITY } from "../brain/tags.js";

export const SAVE_KINDS = [["piece", "PIECES"], ["post", "POSTS"], ["person", "PEOPLE"], ["place", "PLACES"], ["event", "EVENTS"]];
export const PIECES_PER_BOARD = 6;
export const MAX_SAVES = 80;

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const jit = (s, k) => ((hash(s + ":" + k) % 10000) / 10000) * 2 - 1; // −1…1, the same every time
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function add(a, b, k = 1) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
function sphere(n, offset = 0) { // a Fibonacci sphere: n directions spread evenly
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * g + offset;
    out.push([Math.cos(a) * r, y * 0.82, Math.sin(a) * r]);
  }
  return out;
}
// the ten tags on a sphere, relaxed so that the curated neighbours sit together (a few hundred steps of
// attraction by TAG_AFFINITY against an even repulsion) — the same every time, computed once
let RELAXED = null;
function relaxed() {
  if (RELAXED) return RELAXED;
  const d = sphere(TAGS.length, 0.4).map(norm);
  const aff = (a, b) => (TAG_AFFINITY[a] && TAG_AFFINITY[a][b]) || (TAG_AFFINITY[b] && TAG_AFFINITY[b][a]) || 0;
  for (let step = 0; step < 240; step++) {
    const f = d.map(() => [0, 0, 0]);
    for (let i = 0; i < d.length; i++) for (let j = 0; j < d.length; j++) {
      if (i === j) continue;
      const v = [d[j][0] - d[i][0], d[j][1] - d[i][1], d[j][2] - d[i][2]], l = Math.hypot(v[0], v[1], v[2]) || 1e-3;
      const k = aff(TAGS[i], TAGS[j]) * 0.05 - 0.018 / (l * l);
      f[i] = add(f[i], v, k / l);
    }
    for (let i = 0; i < d.length; i++) d[i] = norm(add(d[i], f[i]));
  }
  RELAXED = d.map((v) => [v[0], v[1] * 0.86, v[2]]);
  return RELAXED;
}
// the curated edges: the API's when it answered, else the same table it serves
function curatedEdges(net) {
  if (net && Array.isArray(net.edges) && net.edges.length) return net.edges;
  const out = [];
  for (const a of Object.keys(TAG_AFFINITY)) for (const [b, w] of Object.entries(TAG_AFFINITY[a])) if (a < b) out.push({ a, b, w });
  return out;
}

// a direction near `d`, pushed off it by a seeded amount, at radius `r`
function near(d, seed, spread, r) { return norm(add(d, [jit(seed, 1), jit(seed, 2), jit(seed, 3)], spread)).map((x) => x * r); }
export const tagOf = (t) => String(t || "").toUpperCase();

export function buildGraph(net, saves, boards, stamps) {
  const nodes = [], edges = [], byId = new Map();
  const put = (n) => { nodes.push(n); byId.set(n.id, n); return n; };
  put({ id: "you", type: "you", label: "YOU", p: [0, 0, 0], r: 9 });
  const tagNodes = net ? net.nodes : TAGS.map((tag) => ({ tag, weight: 0, kind: "none", saves: 0, evidence: [] }));
  const dirs = relaxed();
  const tagDir = {};
  TAGS.forEach((tag, i) => {
    const t = tagNodes.find((x) => x.tag === tag) || { tag, weight: 0, kind: "none", saves: 0, evidence: [] };
    tagDir[tag] = dirs[i];
    put({ id: "tag:" + tag, type: "tag", label: tag, kind: t.kind, data: t, p: dirs[i].map((x) => x * 1.2), r: 4.5 + Math.min(1, Math.abs(t.weight)) * 7 });
    if (Math.abs(t.weight) > 0.04) edges.push({ a: "you", b: "tag:" + tag, k: "weight", kind: t.kind, neg: t.weight < 0, w: Math.min(1, Math.abs(t.weight)) });
  });
  for (const e of curatedEdges(net)) if (e.w >= 0.3) edges.push({ a: "tag:" + e.a, b: "tag:" + e.b, k: "curated", w: e.w });

  // the kinds, each a hub the saves of that kind hang off
  const kept = (saves || []).slice(0, MAX_SAVES);
  const hubDirs = sphere(SAVE_KINDS.length + 1, 2.1);
  SAVE_KINDS.forEach(([k, label], i) => {
    const mine = kept.filter((s) => s.kind === k);
    if (!mine.length) return;
    let hd = hubDirs[i];
    for (const s of mine) for (const t of (s.tags || []).map(tagOf)) if (tagDir[t]) hd = add(hd, tagDir[t], 0.25);
    hd = norm(hd);
    put({ id: "hub:" + k, type: "hub", label, data: { kind: k, saves: mine }, p: hd.map((x) => x * 1.7), r: 4 });
    edges.push({ a: "you", b: "hub:" + k, k: "member" });
    for (const s of mine) {
      const carried = (s.tags || []).map(tagOf).filter((t) => tagDir[t]);
      let d = carried.length ? [0, 0, 0] : hd;
      for (const t of carried) d = add(d, tagDir[t]);
      const id = "save:" + s.kind + ":" + s.id;
      put({ id, type: "save", label: s.title, data: s, p: near(norm(d), id, carried.length ? 0.22 : 0.3, 1.75 + jit(id, 4) * 0.2), r: 2.6 });
      edges.push({ a: id, b: "hub:" + k, k: "member" });
      for (const t of carried) edges.push({ a: id, b: "tag:" + t, k: "carries" });
    }
  });

  // the boards and the pieces on them
  const boardDir = hubDirs[SAVE_KINDS.length];
  (boards || []).forEach((b, i) => {
    const items = (b.items || []).slice(0, PIECES_PER_BOARD);
    const bid = "board:" + b.id;
    const bdir = norm(add(boardDir, [jit(bid, 1), jit(bid, 2), jit(bid, 3)], 0.5 + i * 0.1));
    put({ id: bid, type: "board", label: String(b.name || "board").toUpperCase(), data: b, p: bdir.map((x) => x * 1.7), r: 4 });
    edges.push({ a: "you", b: bid, k: "member" });
    for (const it of items) {
      const pid = "piece:" + b.id + ":" + it.id;
      const carried = (it.tags || []).map(tagOf).filter((t) => tagDir[t]);
      put({ id: pid, type: "piece", label: it.title || "piece", data: it, p: near(carried.length ? norm(add(bdir, carried.reduce((v, t) => add(v, tagDir[t]), [0, 0, 0]), 0.6)) : bdir, pid, 0.24, 1.95 + jit(pid, 4) * 0.15), r: 2.2 });
      edges.push({ a: pid, b: bid, k: "member" });
      for (const t of carried.slice(0, 3)) edges.push({ a: pid, b: "tag:" + t, k: "carries" });
    }
  });

  // the stamps earned, close round YOU
  const earned = (stamps || []).filter((s) => s.earned);
  earned.forEach((s, i) => {
    const a = (i / Math.max(1, earned.length)) * Math.PI * 2;
    put({ id: "stamp:" + s.id, type: "stamp", label: s.label, data: s, p: [Math.cos(a) * 0.5, 0.42, Math.sin(a) * 0.5], r: 3.5 });
    edges.push({ a: "you", b: "stamp:" + s.id, k: "earned" });
  });
  return { nodes, edges: edges.filter((e) => byId.has(e.a) && byId.has(e.b)), byId };
}

