// lib/ai/index.js
// ASILUM ALPHA LEARNING BRAIN — facade and status map.
//
// Base layer (LIVE, do not replace): the **Alpha Learning Bridge** =
// lib/brain/*. It already translates real user signals (favorite, save, bag,
// share, dwell, skip, follows, moodboard training text, board co-membership)
// into two-timescale taste profiles, tag-space vectors, an item-item
// co-engagement graph, popularity counters, and exploration pressure —
// the six weighted bridges. Everything in this folder tree BUILDS AROUND it.
//
// Module map (see lib/ALPHA-BRAIN.md for the full architecture):
//   lib/events                   — canonical user-event vocabulary
//   lib/fashion-taxonomy         — tags/categories/materials/eras/moods
//   lib/embeddings               — vector contracts (v0 = live tag space)
//   lib/vision                   — image/fit-pic analysis contracts
//   lib/visual-personalization   — Pinterest-style board/visual taste
//   lib/taste-graph              — TikTok-style cross-user intelligence
//   lib/recommendations          — recommender service facade
//   lib/feed                     — feed composition foundation
//   lib/music-mapping            — music → aesthetic-tag mapping
//   lib/connectors               — external account connector registry
//   lib/background-jobs          — future learning-job registry
//   lib/mock-data                — index of every mock in the app
//   lib/db/types.js              — entity typedefs; supabase/schema-alpha.sql

import { authConfigured } from "../supabase.js";

// What is real today vs. contracted-but-placeholder. Introspectable so a
// future /stats panel can render it without guessing.
export function bridgeStatus() {
  return {
    baseLayer: "Alpha Learning Bridge (lib/brain) — LIVE",
    live: [
      "taste profiles (two-timescale, clock forgetting)",
      "aesthetic tag space + lexicon (lib/brain/tags.js, lexicon.js)",
      "item-item co-engagement graph (gamma bridge / edges)",
      "popularity + exploration bridges",
      "behavior signals via /api/interaction",
      "canonical event history (lib/events → user_events via lib/db; interaction/board-save/search write it)",
      "outfit engine (stylist), sizing, eBay adapter (env-gated)",
      "supabase auth (env-gated), profile/board adoption (/api/auth)",
    ],
    v0_real_math: [
      "embeddings: tag-space vectors + cosine (lib/embeddings)",
      "board-level taste profiles from item tags (lib/visual-personalization)",
      "user-to-user similarity from profile vectors (lib/taste-graph)",
      "music → tag mapping over a curated table (lib/music-mapping)",
    ],
    placeholder: [
      "visual embeddings / image analysis / fit-pic analyzer (lib/vision)",
      "taste clusters + collaborative filtering at scale (lib/taste-graph)",
      "connectors: pinterest, spotify, shopify, stripe, resale, designer feeds",
      "background learning jobs (no job runner in the stack yet)",
      "alpha-schema DB tables (supabase/schema-alpha.sql — staged, not applied)",
    ],
    env: { supabaseAuth: authConfigured() },
  };
}
