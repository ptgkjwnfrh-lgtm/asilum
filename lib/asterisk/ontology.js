// lib/asterisk/ontology.js
// Asterisk AI — canonical fashion ontology v1 (the shared fashion language).
// Every tag has ONE defined meaning: a canonical id ("<type>.<slug>"), a
// display label, and aliases that collapse duplicates ("dark-romantic",
// "dark romance", "romantic darkness" → one id). The code seed below is the
// source of truth; syncOntology() upserts it into ontology_tags so admin
// tooling and future services read one registry.
//
// v1 deliberately seeds from vocabularies the app ALREADY scores against —
// the Alpha brain aesthetic tags and lib/fashion-taxonomy — so the ontology
// extends the live system instead of forking it (Alpha Bridge untouched).

import { TAGS as AESTHETIC_TAGS } from "../brain/tags.js";
import {
  CATEGORIES, MATERIALS, SILHOUETTES, COLORS, ERAS, MOODS,
} from "../fashion-taxonomy/index.js";
import { upsertOntologyTags } from "../db/production.js";

const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function entry(type, label, { aliases = [], parent = null, description = "" } = {}) {
  return {
    id: `${type}.${slug(label)}`,
    label: String(label).toLowerCase(),
    tagType: type,
    parentId: parent,
    aliases: aliases.map((a) => String(a).toLowerCase().trim()),
    description,
  };
}

// Curated alias map for the seed vocabularies (extend as real data arrives —
// additions are versioned rows, never silent renames).
const ALIASES = {
  "avant-garde": ["avantgarde", "avant garde", "experimental", "deconstructed"],
  minimal: ["minimalist", "minimalism", "quiet luxury", "quiet-luxury"],
  seductive: ["sensual", "dark romantic", "dark-romantic", "dark romance", "romantic darkness"],
  tailored: ["tailoring", "sartorial", "power tailoring"],
  streetwear: ["street", "street style"],
  utilitarian: ["utility", "workwear", "techwear"],
  gorp: ["gorpcore", "outdoor", "technical outdoor"],
  archival: ["archive", "vintage designer"],
  grey: ["gray"],
  "90s": ["1990s", "nineties"],
  "70s": ["1970s", "seventies"],
  "80s": ["1980s", "eighties"],
  "60s": ["1960s", "sixties"],
  y2k: ["2000s", "millennium"],
  denim: ["jean", "jeans"],
  footwear: ["shoes", "sneakers", "boots"],
  outerwear: ["jackets", "coats"],
  moody: ["dark", "brooding"],
};

export const ONTOLOGY_SEED = [
  ...AESTHETIC_TAGS.map((t) =>
    entry("aesthetic", t, { aliases: ALIASES[t.toLowerCase()] || [],
      description: "Alpha brain aesthetic axis" })),
  ...CATEGORIES.map((t) => entry("category", t, { aliases: ALIASES[t] || [] })),
  ...MATERIALS.map((t) => entry("material", t, { aliases: ALIASES[t] || [] })),
  ...SILHOUETTES.map((t) => entry("silhouette", t, { aliases: ALIASES[t] || [] })),
  ...COLORS.map((t) => entry("color", t, { aliases: ALIASES[t] || [] })),
  ...ERAS.map((t) => entry("era", t, { aliases: ALIASES[t] || [] })),
  ...MOODS.map((t) => entry("mood", t, { aliases: ALIASES[t] || [] })),
];

// alias/label (lowercased) → canonical entry. Built once per process.
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const e of ONTOLOGY_SEED) {
    INDEX.set(e.label, e);
    INDEX.set(slug(e.label), e);
    for (const a of e.aliases) { INDEX.set(a, e); INDEX.set(slug(a), e); }
  }
  return INDEX;
}

/**
 * Resolve a free-form tag value to its canonical ontology entry.
 * @param {string} value  raw tag text (any casing/spacing)
 * @param {string} [tagType]  restrict to a type (e.g. "color")
 * @returns {{id,label,tagType}|null} null = not in the ontology (kept as-is,
 *          uncanonicalized — never invented).
 */
export function resolveTag(value, tagType = null) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return null;
  const hit = index().get(v) || index().get(slug(v));
  if (!hit) return null;
  if (tagType && hit.tagType !== tagType) return null;
  return { id: hit.id, label: hit.label, tagType: hit.tagType };
}

// Upsert the code seed into ontology_tags (admin-triggered; idempotent).
export async function syncOntology() {
  return upsertOntologyTags(ONTOLOGY_SEED);
}
