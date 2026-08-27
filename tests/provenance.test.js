// tests/provenance.test.js
// OWNER RULING, 27 AUGUST 2026: marketplace inventory is INGESTED, LABELLED,
// AND NOT HIDDEN. These are the assertions that fail when it starts being
// hidden again — by omission on a new surface, or by a source quietly being
// treated as backed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import {
  originEvidence, brandIsEstablished, DEMO, VERIFIED, UNVERIFIED,
} from "../lib/provenance.js";
import { publicProduct } from "../lib/products.js";

const live = (source) => ({
  id: "p1", title: "coat", brand: "Balenciaga", price: 100,
  source_name: source, source_product_url: "https://example.com/item/1",
});

test("a marketplace listing is unverified, and its brand is a CLAIM", () => {
  for (const source of ["taobao", "yahoo-auctions", "mercari", "rakuma", "buyee", "zenmarket", "ebay"]) {
    const e = originEvidence(live(source));
    assert.equal(e.status, UNVERIFIED, `${source} must not read as backed`);
    assert.equal(e.brandIsClaim, true,
      `${source}: the brand on a marketplace listing is the seller's word`);
    assert.ok(e.note && e.note.length > 20, `${source} must carry a sentence to show`);
  }
});

test("Taobao names itself, because 'unverified' alone tells a reader nothing", () => {
  const e = originEvidence(live("taobao"));
  assert.match(e.note, /Taobao/, "the reader is told WHERE it is listed");
  assert.match(e.note, /not a fact ASILUM has checked/,
    "and told plainly that nobody checked the brand");
});

test("VERIFICATION IS EARNED — an unknown source gets no benefit of the doubt", () => {
  // The direction of this default is the whole safety property. Guessing
  // "verified" tells a reader something is genuine when nobody checked.
  const e = originEvidence(live("some-source-nobody-registered"));
  assert.equal(e.status, UNVERIFIED);
  assert.equal(e.brandIsClaim, true);
  assert.equal(brandIsEstablished(live("some-source-nobody-registered")), false);
});

test("a merchant under agreement is backed — and that is about the MERCHANT", () => {
  for (const source of ["shopify", "woocommerce"]) {
    const e = originEvidence(live(source));
    assert.equal(e.status, VERIFIED);
    assert.equal(e.brandIsClaim, false);
    // It must never read as a claim about the garment itself.
    assert.doesNotMatch(e.note, /authentic|genuine|verified item/i,
      "ASILUM authenticates nothing; this is an agreement with a merchant");
  }
});

test("a record with no live link is a sample, whatever it calls itself", () => {
  assert.equal(originEvidence({ id: "x", source_name: "taobao" }).status, DEMO);
  assert.equal(originEvidence({ id: "x", source_name: "Asilum synthetic seed" }).status, DEMO);
  assert.equal(originEvidence(null).status, DEMO);
});

test("every public payload carries its provenance", () => {
  // Stamped server-side beside `purchasable`, so no client re-derives the rule
  // and drifts from it.
  const payload = publicProduct(live("taobao"));
  assert.ok(payload.originEvidence, "publicProduct must stamp originEvidence");
  assert.equal(payload.originEvidence.status, UNVERIFIED);
  assert.equal(payload.originEvidence.brandIsClaim, true);
});

test("NOT HIDDEN: every surface that shows a piece shows what backs it", () => {
  // The ruling's teeth. A new grid that renders ColorEvidenceLine without
  // OriginLine is a surface where marketplace stock appears unlabelled — which
  // is exactly the thing the owner ruled against — so the two are pinned
  // together and this fails the moment they come apart.
  const files = execSync(
    "grep -rl 'ColorEvidenceLine' app --include=*.js --include=*.jsx || true",
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);

  assert.ok(files.length >= 7, "expected the known product surfaces");
  for (const file of files) {
    if (file.endsWith("ProductSignals.jsx")) continue; // where both are defined
    const src = readFileSync(file, "utf8");
    const colour = (src.match(/<ColorEvidenceLine\b/g) || []).length;
    const origin = (src.match(/<OriginLine\b/g) || []).length;
    assert.equal(origin, colour,
      `${file} renders ${colour} colour line(s) but ${origin} provenance line(s) — `
      + "a piece must not be shown without what backs it");
  }
});

test("the label is loud where it knows least, quiet only where it is backed", () => {
  const src = readFileSync("app/components/ProductSignals.jsx", "utf8");
  const component = src.slice(src.indexOf("export function OriginLine"));
  // Only the VERIFIED branch may return null, and only on a card.
  assert.match(component, /evidence\.status === "verified" && !detailed[\s\S]*?return null/,
    "silence is reserved for a merchant under agreement");
  assert.match(component, /UNVERIFIED ORIGIN/, "the unverified state says so in words");
});
