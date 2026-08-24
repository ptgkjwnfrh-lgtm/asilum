// lib/asterisk/memory.js — the Asterisk memory READ FACADE (ADR-001, v2).
// One versioned contract that Home, Discover, Stylist, Moodboard, Profile,
// the drawer, and /asterisk all read. Every field maps to an EXISTING store;
// this module aggregates but never invents or cache-persists a competing
// profile. Mutations route to the existing endpoints (/api/why, /api/privacy,
// /api/reset, /api/measurements, /api/follow). Its preference domain owns
// section visibility and whether the saved Passport may guide surfaces.

import { EVIDENCE_FLOOR } from "./margin.js";
import {
  listUserCorrections,
  getUserMeasurements,
  getMemoryPreferences,
  listFollows,
  listLearnedFacts,
} from "../db/production.js";
import { getProfile } from "../db/index.js";
import { getUserStyleProfile } from "../ai/styleProfile.js";
import { vizState } from "../brain/memory.js";
import { hasMeasurementProfile } from "../brain/measurements.js";
import { AESTHETIC_TREND_META } from "./trends.js";

export const MEMORY_CONTRACT_VERSION = 2;
// Section ids the visibility preferences may reference — the drawer/page
// render exactly these groups.
export const MEMORY_SECTIONS = Object.freeze(["explicit", "inferred", "global", "uncertainty"]);
// One floor, one place — see lib/asterisk/margin.js. This was the same number
// typed twice, in two files that never referenced each other.
const LOW_SIGNAL_FLOOR = EVIDENCE_FLOOR;

function topTags(list, n = 8) {
  return (Array.isArray(list) ? list : []).slice(0, n)
    .map((t) => ({ tag: t.tag, weight: t.weight ?? t.score ?? null }));
}

// Presence and staleness only — raw measurement values never leave
// /api/measurements (ADR-001 rule 2).
function measurementsStatus(profile) {
  return { set: hasMeasurementProfile(profile), source: "/api/measurements" };
}

export async function asteriskMemory(userId) {
  if (!userId) return { ok: false, error: "user required" };
  const [corrections, follows, measurements, styleProfile, brainProfile, learned, preferences] =
    await Promise.all([
      listUserCorrections(userId, 20),
      listFollows(userId),
      getUserMeasurements(userId),
      getUserStyleProfile(userId).catch(() => null),
      getProfile(userId).catch(() => null),
      listLearnedFacts({ status: "approved", limit: 5 }),
      getMemoryPreferences(userId),
    ]);

  const viz = vizState(brainProfile || {});
  const signalCount = Object.values(styleProfile?.sources || {}).reduce((s, n) => s + (n || 0), 0);
  const lowSignal = signalCount < LOW_SIGNAL_FLOOR;

  const openQuestions = [];
  if (!measurementsStatus(measurements).set) {
    openQuestions.push({
      id: "measurements-missing",
      question: "No fit profile yet — sizes in looks and tickets stay generic.",
      action: "/profile#measurements",
    });
  }
  if (lowSignal) {
    openQuestions.push({
      id: "low-signal",
      question: "Too few signals to read your taste with confidence — train the moodboard or save pieces.",
      action: "/board",
    });
  }
  if (!follows.length) {
    openQuestions.push({
      id: "no-follows",
      question: "Following no brands or people — the FOLLOWING tab has nothing to blend.",
      action: "/discover",
    });
  }

  return {
    ok: true,
    memory: {
      contractVersion: MEMORY_CONTRACT_VERSION,
      explicit: {
        corrections: corrections.map((c) => ({
          id: c.id, code: c.code, productId: c.productId ?? c.product_id ?? null,
          brand: c.brand || null, createdAt: c.createdAt ?? c.created_at ?? null,
        })),
        follows,
        // Craving is a per-request dial, never persisted — say so instead of
        // inventing a stored state.
        craving: { persisted: false, scope: "per-request" },
        measurements: measurementsStatus(measurements),
      },
      inferred: {
        dominantAesthetics: topTags(styleProfile?.dominantAesthetics),
        avoidedTags: topTags(styleProfile?.avoidedTags),
        recentActivity: (viz.recent || []).slice(0, 10),
        recentlyForgotten: (viz.forgotten || []).slice(0, 5),
        tasteSummary: styleProfile?.tasteSummary || null,
        signalCount,
      },
      global: {
        recentlyLearned: learned.map((f) => ({
          entityType: f.entityType ?? f.entity_type ?? null,
          entityId: f.entityId ?? f.entity_id ?? null,
          provenance: "research-approved",
          sourceCount: (f.sourceUrls ?? f.source_urls ?? []).length,
        })),
        trendReviewDue: AESTHETIC_TREND_META.reviewBy,
      },
      uncertainty: { lowSignal, openQuestions },
      controls: {
        forget: [
          { label: "correct a recommendation", endpoint: "/api/why", method: "POST" },
          { label: "update or clear fit profile", endpoint: "/api/measurements", method: "PUT|DELETE" },
          { label: "unfollow", endpoint: "/api/follow", method: "POST" },
          { label: "reset brain", endpoint: "/api/reset", method: "POST" },
        ],
        export: true,
        delete: { endpoint: "/api/privacy", method: "DELETE", confirm: "DELETE PERSONALIZATION" },
      },
      preferences,
    },
  };
}
