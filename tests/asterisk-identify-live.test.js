// tests/asterisk-identify-live.test.js — the identification step against
// the REAL model, on one real production listing. Skipped without a key:
//   npm run test:live-asterisk
// (like test:live-stripe, this reads the key from .env.local — `npm test`
// never loads that file, trap 71). It spends money: one Opus 5 call with
// three photographs and up to three searches, in the tens of cents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyListing, identifyConfig } from "../lib/asterisk/stream/identify.js";
import { decodeAspects } from "../lib/asterisk/stream/decode.js";
import { composeTags } from "../lib/asterisk/stream/tags.js";
import { TAGS } from "../lib/brain/tags.js";

const cfg = identifyConfig();
const LIVE = cfg.enabled;

// the first production listing first light read on 10 Sep 2026
const LISTING = {
  title: "Helmut Lang x Travis Scott Cowboy BomberJacket",
  brand: "HELMUT LANG", price: 290.9, currency: "USD", condition: "Pre-owned - Excellent",
  categoryPath: "Clothing, Shoes & Accessories|Men|Men's Clothing|Coats, Jackets & Vests",
  decoded: decodeAspects([
    { name: "Outer Shell Material", value: "Polyester" }, { name: "Size", value: "S" }, { name: "Color", value: "Black" },
    { name: "Vintage", value: "No" }, { name: "Brand", value: "HELMUT LANG" }, { name: "Type", value: "Jacket" },
    { name: "Department", value: "Men" }, { name: "Style", value: "Bomber Jacket" }, { name: "Theme", value: "Cowboy" },
  ]),
  description: "Rare Helmut Lang x Travis Scott Cowboy bomber jacket in black. Features signature Cowboy graphics on the front and oversized back print, utility sleeve details, snap pockets, and premium hardware.",
  images: ["https://i.ebayimg.com/images/g/9yEAAeSwJyBqn4JT/s-l1600.jpg"],
};

test("LIVE: Asterisk identifies a real listing and returns a capped, useful record", { skip: !LIVE && "no ANTHROPIC_API_KEY — set it in .env.local and run npm run test:live-asterisk" }, async () => {
  const out = await identifyListing(LISTING, { config: cfg });
  assert.equal(out.status, "ok", `status ${out.status} ${out.error || ""}`);
  const rec = out.record;
  assert.ok(rec.confidence > 0 && rec.confidence <= 0.95);
  assert.match(String(rec.identification.house || ""), /helmut lang/i);
  assert.ok(rec.descriptors.length >= 6, `only ${rec.descriptors.length} descriptors`);
  assert.ok(rec.descriptors.every((d) => d.weight <= 0.9 && /^[a-z0-9][a-z0-9' -]{0,29}$/.test(d.tag)));
  assert.ok(TAGS.every((t) => typeof rec.taste[t] === "number"));
  assert.ok(rec.taste.STREETWEAR > rec.taste.TAILORED, "a Travis Scott bomber reads streetwear over tailored");
  assert.ok(rec.evidence.length > 0);
  assert.ok(out.costUsd > 0 && out.costUsd < 2, `cost ${out.costUsd}`);
  const composed = composeTags({ ...LISTING, identification: rec });
  assert.ok(Object.keys(composed.tags).some((k) => k === k.toLowerCase()), "descriptors reach the tag object");
  console.log(JSON.stringify({ house: rec.identification.house, garment: rec.identification.garment, year: rec.identification.year, confidence: rec.confidence, descriptors: rec.descriptors.slice(0, 12), cost: out.costUsd, searched: out.searched, iterations: out.iterations }, null, 1));
});
