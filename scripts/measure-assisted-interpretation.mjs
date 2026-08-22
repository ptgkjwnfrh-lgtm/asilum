#!/usr/bin/env node
// scripts/measure-assisted-interpretation.mjs — the safety rails around a
// model-assisted read, measured before anyone turns one on.
//
// WHAT THIS MEASURES, AND WHAT IT CANNOT. It measures the MACHINERY: that a
// parsed constraint is actually applied, that an invented value never reaches
// a rack, that an assisted row is labelled and capped, that the disclosure
// fires, and that the model is not called for queries the deterministic engine
// already answers. It does NOT measure a model's quality — no key is
// configured and none is needed to ship the machinery, so the "model" here is
// a FIXTURE: a hand-written interpretation for each probe, exactly the shape a
// competent parser would return. Judging a real provider needs a real key and
// is the owner's call, not this script's.
//
// THE STANDING BAR, declared here so it is not invented later: assistance may
// only be switched on in production once a keyed run of this corpus shows the
// assisted arm serving MORE constrained racks than the deterministic arm with
// zero invented values reaching a rack and zero uncapped assisted rows. Until
// then AI_SEARCH_ENABLED stays off and no route passes `assist`.
//
//   node scripts/measure-assisted-interpretation.mjs

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");
const { PROVIDERS } = await import("../lib/ai/adapter.js");
const { itemMatchesEra } = await import("../lib/search/era.js");
const { itemMatchesOrigin, parseOriginConstraint } = await import("../lib/search/origin.js");
const { itemMatchesSize } = await import("../lib/search/size.js");

// Queries the deterministic engine cannot constrain: no era word, no origin,
// no size, no budget, no garment noun it knows, no mapping phrase.
const HARD = [
  { q: "something quiet for a rainy evening", fx: { aesthetics: ["minimal"], reading: "quiet, restrained clothes" } },
  { q: "what to wear hiking in the cold", fx: { aesthetics: ["gorp", "utilitarian"], garments: ["fleece"], reading: "technical outdoor layers" } },
  { q: "clothes for a gallery opening", fx: { aesthetics: ["avant-garde", "tailored"], reading: "sharp, considered dressing" } },
  { q: "something loud for a night out", fx: { aesthetics: ["statement", "seductive"], reading: "high-impact evening pieces" } },
  { q: "an outfit for meeting the parents", fx: { aesthetics: ["tailored", "minimal"], reading: "polite, quiet dressing" } },
  { q: "old school skate clothes but nothing with a logo", fx: { aesthetics: ["streetwear"], exclusions: ["logo"], reading: "skate clothes without branding" } },
  { q: "something for a wedding in kyoto", fx: { origins: ["japanese"], aesthetics: ["tailored"], reading: "japanese formal dressing" } },
  { q: "the coat everyone wore twenty years ago", fx: { garments: ["coat"], era: { minYear: 1996, maxYear: 2006 }, reading: "outerwear from two decades back" } },
  { q: "the biggest thing you have", fx: { size: "XXL", reading: "the largest sizes stocked" } },
  { q: "nothing over two thousand dollars", fx: { maxPrice: 2000, reading: "a two-thousand-dollar ceiling" } },
  // A fixture that is entirely invented — nothing may reach a rack.
  { q: "zzqx vvbnm", fx: { garments: ["spacesuit"], aesthetics: ["cottagecore"], origins: ["atlantean"], size: "XXXXL", reading: "nonsense" }, invented: true },
];

// Queries the deterministic engine already answers — the model must not be
// called for any of them.
// AMENDMENT 1, declared after run 1. Four probes written as "hard" were not:
// the deterministic engine already reads "nineties" as an era, "medium" as a
// size, "winter" as a climate and "workwear" as a mapping phrase, so the model
// was correctly never called for them and their fixtures were never applied —
// which the run then scored as 35 constraint violations against constraints
// nothing had applied. They belong here, where being answered without a model
// is the pass condition, and the violation count is measured only where the
// assist actually ran.
const ALREADY_UNDERSTOOD = [
  "90s jacket", "japanese coat", "medium knit", "jun takahashi", "no logo hoodie",
  "jacket under 400", "rick owens", "gorpcore", "vintage knit", "size 32",
  "tokyo street style in the nineties", "the most understated thing you have in a medium",
  "a coat for a berlin winter under a thousand dollars", "workwear that survives a building site",
];

const AI_KEYS = ["AI_FEATURES_ENABLED", "AI_PROVIDER", "AI_MODEL_NAME", "AI_API_KEY", "AI_SEARCH_ENABLED"];
const ON = { AI_FEATURES_ENABLED: "true", AI_PROVIDER: "openai", AI_API_KEY: "k",
             AI_MODEL_NAME: "fixture", AI_SEARCH_ENABLED: "true" };

let calls = 0;
const saved = Object.fromEntries(AI_KEYS.map((k) => [k, process.env[k]]));
const savedProvider = PROVIDERS.openai;
let fixture = {};
Object.assign(process.env, ON);
PROVIDERS.openai = async () => { calls++; return JSON.stringify(fixture); };

const honours = (item, fx) => {
  if (fx.era && !itemMatchesEra(item, fx.era)) return false;
  if (fx.origins?.length) {
    const origin = parseOriginConstraint(fx.origins).origin;
    if (origin && !itemMatchesOrigin(item, origin)) return false;
  }
  if (fx.size && !itemMatchesSize(item, { kind: "fit", fits: fx.size })) return false;
  if (fx.maxPrice != null && !(typeof item.price === "number" && item.price <= fx.maxPrice)) return false;
  if (fx.minPrice != null && !(typeof item.price === "number" && item.price >= fx.minPrice)) return false;
  return true;
};

const rows = [];
let constrainedOff = 0, constrainedOn = 0, violations = 0, uncapped = 0, inventedApplied = 0, undisclosed = 0;

for (const probe of HARD) {
  fixture = {};
  const off = await searchProducts(probe.q, { limit: 24 });
  fixture = probe.fx;
  const on = await searchProducts(probe.q, { limit: 24, assist: true });

  const offConstrained = !!(off.interpreted.era || off.interpreted.origin || off.interpreted.size);
  const assist = on.interpreted.assist;
  const onConstrained = !!(assist && assist.applied.length);
  if (offConstrained) constrainedOff++;
  if (onConstrained) constrainedOn++;

  // Only where the assist actually ran: a fixture that was never applied
  // cannot be violated (amendment 1).
  const bad = onConstrained ? (on.results || []).filter((it) => !honours(it, probe.fx)) : [];
  if (!probe.invented) violations += bad.length;
  const over = (on.results || []).filter((it) => it.matchReason === "assisted read" && it.confidenceScore > 0.4);
  uncapped += over.length;
  if (probe.invented && assist) inventedApplied++;
  if (onConstrained && !/model-assisted reading/.test(String(on.note || ""))) undisclosed++;

  rows.push({
    q: probe.q,
    off: off.total, on: on.total,
    applied: assist ? assist.applied.join(" · ") : "-",
    dropped: assist ? assist.dropped.length : 0,
    violations: probe.invented ? 0 : bad.length,
  });
}

// The model must never be called for a query the engine already answers.
const before = calls;
for (const q of ALREADY_UNDERSTOOD) await searchProducts(q, { limit: 24, assist: true });
const calledOnUnderstood = calls - before;

PROVIDERS.openai = savedProvider;
for (const k of AI_KEYS) delete process.env[k];
for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;

console.log(`\nASSISTED INTERPRETATION — fixture-driven, no provider key required`);
console.log("query".padEnd(46), "off".padStart(5), "on".padStart(5), " applied");
for (const r of rows) {
  console.log(r.q.padEnd(46), String(r.off).padStart(5), String(r.on).padStart(5),
    " " + (r.applied || "-") + (r.dropped ? `  [dropped ${r.dropped}]` : ""));
}
console.log(`\nhard queries with a constrained rack:  ${constrainedOff} → ${constrainedOn} of ${HARD.length - 1}`);
console.log(`constraint violations in served rows:  ${violations}`);
console.log(`invented fixtures that reached a rack: ${inventedApplied}`);
console.log(`assisted rows above the 0.4 ceiling:   ${uncapped}`);
console.log(`assisted racks with no disclosure:     ${undisclosed}`);
console.log(`model calls on already-understood queries: ${calledOnUnderstood} of ${ALREADY_UNDERSTOOD.length}`);

const pass = violations === 0 && inventedApplied === 0 && uncapped === 0 &&
  undisclosed === 0 && calledOnUnderstood === 0 && constrainedOn > constrainedOff;
console.log(`\nVERDICT: ${pass ? "PASS" : "FAIL"} (the machinery and its rails; a model's quality is not measured here)`);
process.exit(pass ? 0 : 1);
