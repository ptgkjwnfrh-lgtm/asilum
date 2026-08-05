// lib/search/suggest.js
// Autocomplete + misspelling correction. Basic fuzzy matching on purpose
// (constitution: don't overcomplicate; no AI here). SERVER-ONLY via the pool.
//
// Vocabulary = live brand names + aesthetic tags + mapping phrases/terms +
// garment words + cultural references (Aug 5, owner report: typing a
// celebrity produced NO suggestions — the vocabulary simply had no cultural
// entities, and "carti" fuzzy-corrected to "cargo"). Culture terms are added
// LAST so exact garment/brand matches keep their precedence, aliases surface
// their canonical name ("king vamp" suggests "playboi carti"), and entities
// with ≥2 distinct readings also offer era-qualified strings
// ("kanye west — polo era") that the orchestrator's era targeting resolves.
// Returns 3–10 suggestions when possible: corrected spellings, related
// fashion terms, designers, cultural references, and "like <designer>".

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

// culture: [{ name, aliases: [], eras: [{ id, label }] }] — a light view of
// the Asterisk culture catalog, passed in by the route so this module stays
// dependency-free and unit-testable.
export function buildVocabulary(pool, mappings = DEFAULT_MAPPINGS, aesthetics = [], culture = []) {
  const vocab = new Map(); // term -> { kind, display } (display ≠ term for aliases)
  const add = (term, kind, display = null) => {
    const t = String(term || "").toLowerCase().trim();
    if (t.length > 2 && !vocab.has(t)) vocab.set(t, { kind, display: display || t });
  };
  for (const it of pool) add(it.brand, "designer");
  for (const a of aesthetics) add(a, "aesthetic");
  for (const m of mappings) {
    add(m.searchPhrase, "phrase");
    for (const t of m.relatedTerms || []) add(t, "term");
  }
  for (const g of GARMENTS) add(g, "term");
  for (const c of culture) {
    add(c.name, "culture");
    for (const a of c.aliases || []) add(a, "culture", String(c.name).toLowerCase());
    const eras = (c.eras || []).filter((e) => e?.label && e.label.toLowerCase() !== String(c.name).toLowerCase());
    if (eras.length >= 2) {
      for (const e of eras) add(`${c.name} — ${e.label}`, "era");
    }
  }
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

  // Culture terms can match through aliases the display label never shows
  // ("ho" hitting Jay-Z through the alias "hov" reads as a bug even though it
  // isn't), and two typed characters are not evidence of cultural intent. So:
  // an exactly-typed term always shows; entity NAMES complete from 3 chars;
  // alias / substring / fuzzy culture matches need 4+ typed chars. Garment
  // and brand vocabulary keeps its original behavior everywhere.
  const cultureVisible = (term, meta, mode) => {
    if (meta.kind !== "culture" && meta.kind !== "era") return true;
    if (term === q) return true;
    if (mode === "prefix" && meta.display === term) return q.length >= 3;
    return q.length >= 4;
  };

  // 1) prefix + substring matches (the expected case)
  for (const [term, meta] of vocab) {
    if (term.startsWith(q) && cultureVisible(term, meta, "prefix")) push(meta.display, meta.kind, "match");
  }
  for (const [term, meta] of vocab) {
    if (term.includes(q) && !term.startsWith(q) && cultureVisible(term, meta, "substring")) push(meta.display, meta.kind, "match");
  }

  // 2) fuzzy corrections — catches "balenciga", "sluby", "trashed"
  if (out.length < max) {
    const budget = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    const fuzzy = [];
    for (const [term, meta] of vocab) {
      if (seen.has(meta.display)) continue;
      if (!cultureVisible(term, meta, "fuzzy")) continue;
      if (Math.abs(term.length - q.length) > budget + 2) continue;
      // compare against the term and against its first word (multi-word terms)
      const first = term.split(" ")[0];
      const d = Math.min(levenshtein(q, term), levenshtein(q, first));
      if (d <= budget) fuzzy.push({ meta, d });
    }
    fuzzy.sort((a, b) => a.d - b.d);
    for (const f of fuzzy) push(f.meta.display, f.meta.kind, "did you mean");
  }

  // 3) "like <designer>" companions for any designer already suggested
  for (const s of [...out]) {
    if (s.kind === "designer" && out.length < max) push(`like ${s.label}`, "similar", "similar to");
  }

  return out.length >= min ? out.slice(0, max) : out; // fewer than min is honest, not padded
}
