#!/usr/bin/env node
// scripts/extract-fashionpedia.mjs — reproducible extraction of the
// Fashionpedia ontology (r13). Reads an official annotation file
// (instances_attributes_*2020.json from the ifashionist-dataset S3 bucket,
// see github.com/cvdfoundation/fashionpedia) and writes ONLY the ontology —
// category and attribute names + supercategories — to the vendored
// lib/search/fashionpedia-ontology.json. No images, no annotations, no
// per-image licenses: the annotations/ontology are CC BY 4.0 per the
// project's Terms of Use (fashionpedia.github.io/home/data_license.html);
// attribution lives in NOTICE and in the vendored file itself.
//
//   node scripts/extract-fashionpedia.mjs /path/to/instances_attributes_val2020.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) { console.error("usage: extract-fashionpedia.mjs <instances_attributes json>"); process.exit(1); }
const d = JSON.parse(fs.readFileSync(src, "utf8"));

const out = {
  source: "Fashionpedia (github.com/cvdfoundation/fashionpedia), ontology extract",
  license: "CC BY 4.0 — https://fashionpedia.github.io/home/data_license.html",
  attribution: "Jia et al., Fashionpedia: Ontology, Segmentation, and an Attribute Localization Dataset (ECCV 2020)",
  extracted: "categories and attributes only (names + supercategories); images and annotations are not included",
  categories: d.categories.map((c) => ({ name: c.name, supercategory: c.supercategory })),
  attributes: d.attributes.map((a) => ({ name: a.name, supercategory: a.supercategory })),
};

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, "..", "lib", "search", "fashionpedia-ontology.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`wrote ${dest}: ${out.categories.length} categories, ${out.attributes.length} attributes`);
