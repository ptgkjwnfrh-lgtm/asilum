// lib/embeddings/index.js
// Vector contracts for the Alpha Learning Brain.
//
// v0 (LIVE today): the embedding space IS the aesthetic tag space — items and
// profiles are already vectors over lib/brain/tags.js, scored by the Alpha
// Learning Bridge. tagVector()/cosine() below are real math over that space.
// v1 (future): learned text/visual embeddings from a provider. Gate on
// EMBEDDINGS_PROVIDER + EMBEDDINGS_API_KEY (see .env.example); store in
// product_embeddings / user_embeddings / visual_embeddings (schema-alpha).

import { TAGS } from "../brain/tags.js";
import { notImplemented, real } from "../ai/contract.js";

export function embeddingsConfigured() {
  return !!(process.env.EMBEDDINGS_PROVIDER && process.env.EMBEDDINGS_API_KEY);
}

// v0: dense array over the shared tag vocabulary, from {TAG: weight} maps
// (item.tags and profile.long already have this shape).
export function tagVector(weights = {}) {
  return TAGS.map((t) => weights[t] || 0);
}

export function cosine(a = [], b = []) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// v0 similarity between two {TAG: weight} maps — usable everywhere today.
export function tagSimilarity(wa, wb) {
  return real(cosine(tagVector(wa), tagVector(wb)), "v0 tag-space cosine");
}

// v1 (asterisk-boost r4): text embeddings through the fetch-based provider
// adapter (lib/embeddings/provider.js — voyage | openai, env-gated). Vectors
// live in the schema-alpha `embeddings` table as space "text-v1".
import { providerEmbed, providerInfo } from "./provider.js";

export const TEXT_SPACE = "text-v1";

// The canonical text a product embeds under — stable, so re-embedding is
// deterministic. Only fields that actually exist ride along (absent is absent).
export function itemEmbedText(it = {}) {
  const tagWords = Object.entries(it.tags || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t.toLowerCase());
  return [it.brand, it.title, it.category, it.subcategory, it.material, it.color,
    it.decade, tagWords.join(" "), it.description]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 2000);
}

export async function embedText(text) {
  if (!embeddingsConfigured()) return notImplemented("embedText", "set EMBEDDINGS_PROVIDER/_API_KEY");
  const info = providerInfo();
  try {
    const [vector] = await providerEmbed([text]);
    return real({ vector, provider: info.name, model: info.model, space: TEXT_SPACE },
      `${info.name}/${info.model} text embedding`);
  } catch (e) {
    return notImplemented("embedText", `provider error: ${String(e.message || e).slice(0, 160)}`);
  }
}

export async function embedTexts(texts = []) {
  if (!embeddingsConfigured()) return notImplemented("embedTexts", "set EMBEDDINGS_PROVIDER/_API_KEY");
  const info = providerInfo();
  try {
    const vectors = await providerEmbed(texts);
    return real({ vectors, provider: info.name, model: info.model, space: TEXT_SPACE },
      `${info.name}/${info.model} text embeddings (batch)`);
  } catch (e) {
    return notImplemented("embedTexts", `provider error: ${String(e.message || e).slice(0, 160)}`);
  }
}

export async function embedImage(_imageRef) {
  if (!embeddingsConfigured()) return notImplemented("embedImage", "set EMBEDDINGS_PROVIDER/_API_KEY");
  return notImplemented("embedImage", "visual embeddings need a multimodal provider — text-v1 ships first");
}
