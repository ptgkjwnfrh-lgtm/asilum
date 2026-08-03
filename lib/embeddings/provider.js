// lib/embeddings/provider.js — the v1 provider adapter (asterisk-boost r4).
// Plain fetch against an embeddings REST API; NO new runtime dependencies
// (architecture law). Supported providers, chosen by EMBEDDINGS_PROVIDER:
//   voyage — api.voyageai.com /v1/embeddings   (default model voyage-3.5-lite)
//   openai — api.openai.com  /v1/embeddings    (default model text-embedding-3-small)
// EMBEDDINGS_MODEL overrides the default model. EMBEDDINGS_API_KEY is the
// bearer secret and must ONLY live in env (Vercel project settings or
// .env.local) — never in code, never in a transcript.
//
// This module never fakes: a missing key, an unknown provider, or a provider
// error surfaces as a thrown Error for the caller's contract wrapper.
// SERVER-ONLY.

const PROVIDERS = {
  voyage: {
    url: "https://api.voyageai.com/v1/embeddings",
    model: "voyage-3.5-lite",
    body: (input, model) => ({ input, model }),
    read: (json) => json.data.map((d) => d.embedding),
  },
  openai: {
    url: "https://api.openai.com/v1/embeddings",
    model: "text-embedding-3-small",
    body: (input, model) => ({ input, model }),
    read: (json) => json.data.map((d) => d.embedding),
  },
};

export function providerInfo() {
  const name = String(process.env.EMBEDDINGS_PROVIDER || "").toLowerCase();
  const p = PROVIDERS[name];
  if (!p || !process.env.EMBEDDINGS_API_KEY) return null;
  return { name, model: process.env.EMBEDDINGS_MODEL || p.model };
}

// Embed a batch of texts (max 96 per call — under both providers' limits).
// Returns an array of float vectors, same order as the input.
export async function providerEmbed(texts = []) {
  const name = String(process.env.EMBEDDINGS_PROVIDER || "").toLowerCase();
  const p = PROVIDERS[name];
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!p) throw new Error(`unknown EMBEDDINGS_PROVIDER "${name}" (voyage | openai)`);
  if (!key) throw new Error("EMBEDDINGS_API_KEY not set");
  const input = texts.map((t) => String(t || "").slice(0, 4000));
  if (!input.length) return [];
  if (input.length > 96) throw new Error("batch too large — max 96 texts per call");
  const model = process.env.EMBEDDINGS_MODEL || p.model;
  // EMBEDDINGS_URL points the same request shape at a self-hosted endpoint
  // (TEI-style servers speak the OpenAI embeddings contract).
  const url = process.env.EMBEDDINGS_URL || p.url;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(p.body(input, model)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${name} embeddings ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const vectors = p.read(json);
  if (!Array.isArray(vectors) || vectors.length !== input.length) {
    throw new Error(`${name} returned ${vectors?.length ?? 0} vectors for ${input.length} inputs`);
  }
  return vectors;
}
