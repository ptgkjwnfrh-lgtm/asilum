// Transient craving context. This is deliberately separate from the durable
// taste profile: what someone needs tonight should steer this feed without
// rewriting who they are.

const OCCASION_TAGS = Object.freeze({
  everyday: { MINIMAL: 0.55, STREETWEAR: 0.35 },
  work: { TAILORED: 0.85, MINIMAL: 0.45 },
  date: { SEDUCTIVE: 0.75, TAILORED: 0.35 },
  night: { STATEMENT: 0.8, SEDUCTIVE: 0.55 },
  event: { STATEMENT: 0.8, TAILORED: 0.55 },
  travel: { UTILITARIAN: 0.65, MINIMAL: 0.4, GORP: 0.3 },
  outdoors: { GORP: 0.85, UTILITARIAN: 0.65 },
});

const MOOD_TAGS = Object.freeze({
  quiet: { MINIMAL: 0.85, TAILORED: 0.25 },
  sharp: { TAILORED: 0.8, STATEMENT: 0.35 },
  romantic: { SEDUCTIVE: 0.75, ARCHIVAL: 0.35 },
  experimental: { "AVANT-GARDE": 0.9, INDEPENDENT: 0.55 },
  nostalgic: { ARCHIVAL: 0.9, INDEPENDENT: 0.3 },
  practical: { UTILITARIAN: 0.8, GORP: 0.35, MINIMAL: 0.25 },
});

const TEXT_TAGS = Object.freeze({
  dark: { "AVANT-GARDE": 0.55, ARCHIVAL: 0.25 },
  clean: { MINIMAL: 0.65, TAILORED: 0.25 },
  loud: { STATEMENT: 0.75 },
  sexy: { SEDUCTIVE: 0.8 },
  romantic: { SEDUCTIVE: 0.65, ARCHIVAL: 0.25 },
  vintage: { ARCHIVAL: 0.8 },
  futuristic: { "AVANT-GARDE": 0.75, STATEMENT: 0.35 },
  outdoors: { GORP: 0.8, UTILITARIAN: 0.45 },
  street: { STREETWEAR: 0.8 },
  independent: { INDEPENDENT: 0.8 },
  unusual: { INDEPENDENT: 0.55, "AVANT-GARDE": 0.5 },
});

const valid = (value, allowed) => allowed.includes(value) ? value : "";

/** Normalise a craving request, dropping any occasion/mood the table does not
 *  define. Novelty defaults to "discovery". An unknown value becomes "" rather
 *  than passing through — this feeds ranking, and an unrecognised key would
 *  silently contribute nothing while looking honoured. */
export function parseCravingContext(input = {}) {
  const text = String(input.text || "").trim().toLowerCase().slice(0, 240);
  return {
    text,
    occasion: valid(String(input.occasion || "").toLowerCase(), Object.keys(OCCASION_TAGS)),
    mood: valid(String(input.mood || "").toLowerCase(), Object.keys(MOOD_TAGS)),
    novelty: valid(String(input.novelty || "").toLowerCase(), ["safe", "discovery", "wildcard"]) || "discovery",
  };
}

/** The tag vector for a craving — occasion, mood and recognised words, each
 *  capped at 1 so no single signal can dominate. Words the table does not know
 *  contribute nothing; this is a curated map, never inference. */
export function cravingVector(raw = {}) {
  const context = parseCravingContext(raw);
  const vec = {};
  const add = (weights) => {
    for (const [tag, weight] of Object.entries(weights || {})) {
      vec[tag] = Math.min(1, (vec[tag] || 0) + weight);
    }
  };
  add(OCCASION_TAGS[context.occasion]);
  add(MOOD_TAGS[context.mood]);
  const words = new Set(context.text.split(/[^a-z0-9-]+/).filter(Boolean));
  for (const word of words) add(TEXT_TAGS[word]);
  return vec;
}

/** Did the reader actually ask for something? Used to decide whether to apply
 *  a craving at all — the default "discovery" novelty alone does not count as
 *  a request. */
export function hasCravingContext(raw = {}) {
  const context = parseCravingContext(raw);
  return !!(context.text || context.occasion || context.mood || context.novelty !== "discovery");
}
