// lib/ingest/inferTags.js — ONE text-to-taste bridge for every ingestion path.
//
// A single function, and it is a single function on purpose. Every path that
// turns words into a tag vector — eBay, Shopify, WooCommerce, the mood board,
// the seed catalog — goes through this one call, so a title read on one route
// produces the same vector as the same title read on another.
//
// The moment this is inlined or reimplemented "just for one adapter", two
// sources start disagreeing about what the same garment is, and the
// disagreement is invisible: both answers look reasonable in isolation.

import { coldStart } from "../brain/index.js";

// One shared text-to-vector bridge for every ingestion path.
export function inferTags(text) {
  return coldStart(text || "").profile;
}
