// lib/search/suggest.js
// Autocomplete + misspelling correction. Basic fuzzy matching on purpose
// (constitution: don't overcomplicate; no AI here). SERVER-ONLY via the pool.
//
// Vocabulary = live brand names + aesthetic tags + mapping phrases/terms +
// garment words. Returns 3–10 suggestions when possible: corrected spellings,
// related fashion terms, designers, and "like <designer>".

import { DEFAULT_MAPPINGS } from "./mappings-seed.js";

const GARMENTS = [
  "hoodie", "tee", "jeans", "denim", "jacket", "coat", "parka", "blazer",
  "trousers", "cargo pants", "shorts", "skirt", "dress", "knit", "sweater",
  "cardigan", "boots", "sneakers", "loafers", "derby", "bag", "belt", "beanie",
  "scarf", "bootcut jeans", "bell bottoms", "flare jeans", "slub tee",
  "distressed denim", "repaired jeans", "varsity jacket", "shell", "fleece",
];

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function buildVocabulary(pool, mappings = DEFAULT_MAPPINGS, aesthetics = []) {
  const vocab = new Map(); // term -> kind
  const add = (term, kind) => {
    const t = String(term || "").toLowerCase().trim();
    if (t.length > 2 && !vocab.has(t)) vocab.set(t, kind);
  };
  for (const it of pool) add(it.brand, "designer");
  for (const a of aesthetics) add(a, "aesthetic");
  for (const m of mappings) {
    add(m.searchPhrase, "phrase");
    for (const t of m.relatedTerms || []) add(t, "term");
  }
  for (const g of GARMENTS) add(g, "term");
  return vocab;
}

export function suggest(query, vocab, { min = 3, max = 10 } = {}) {
  const q = String(query || "").toLowerCase().trim();
  if (q.length < 2) return [];
  const out = [];
  const seen = new Set();
  const push = (label, kind, why) => {
    const key = label.toLowerCase();
    if (!seen.has(key) && out.length < max) { seen.add(key); out.push({ label, kind, why }); }
  };

  // 1) prefix + substring matches (the expected case)
  for (const [term, kind] of vocab) {
    if (term.startsWith(q)) push(term, kind, "match");
  }
  for (const [term, kind] of vocab) {
    if (term.includes(q) && !term.startsWith(q)) push(term, kind, "match");
  }

  // 2) fuzzy corrections — catches "balenciga", "sluby", "trashed"
  if (out.length < max) {
    const budget = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    const fuzzy = [];
    for (const [term, kind] of vocab) {
      if (seen.has(term)) continue;
      if (Math.abs(term.length - q.length) > budget + 2) continue;
      // compare against the term and against its first word (multi-word terms)
      const first = term.split(" ")[0];
      const d = Math.min(levenshtein(q, term), levenshtein(q, first));
      if (d <= budget) fuzzy.push({ term, kind, d });
    }
    fuzzy.sort((a, b) => a.d - b.d);
    for (const f of fuzzy) push(f.term, f.kind, "did you mean");
  }

  // 3) "like <designer>" companions for any designer already suggested
  for (const s of [...out]) {
    if (s.kind === "designer" && out.length < max) push(`like ${s.label}`, "similar", "similar to");
  }

  return out.length >= min ? out.slice(0, max) : out; // fewer than min is honest, not padded
}
