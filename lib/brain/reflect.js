// lib/brain/reflect.js — STEP FIVE: when a person answers a piece the system
// sent them, the system asks itself WHY.
//
// The owner's order (10 Sep 2026): "if the item is liked or bought by the
// someone ASTERISK intended it to then the system will learn that it did
// good; if a person doesn't like said item or completely ignores it (care
// way more about a flat-out dislike over an ignored scroll) then it must
// reflect and understand why that user did not like that item."
//
// A reflection is computed from the profile AS IT WAS before the interaction
// is learned: the expectation is what the system believed (the alpha
// similarity between the piece and the person's taste), and the tags that
// carried that belief are the ones that answer for the outcome.
//   hide (a flat-out dislike): the tags the person was believed to like that
//     this piece carried are BLAMED — they take an extra push down, hardest
//     on the strongest belief. The base learn() weight (-0.5) stays.
//   skip (an ignored scroll): weak evidence. Only when the system was
//     confident (expectation ≥ IGNORE_CONFIDENT) do the top beliefs take a
//     small correction; otherwise the scroll teaches nothing here.
//   bag / favorite / save / share: the tags the person was NOT believed to
//     like that this piece carried are CREDITED — a new stream for them.
// The reflection is returned so the route can write it down (a record a
// person can read on their memory page) and so the descriptor outcomes can
// feed the shared stream map (lib/db/production/stream.js).
//
// Pure over the profile: applyReflection returns a new profile object.

import { migrateProfile, tasteVector } from "./index.js";
import { vecSim } from "./bridges.js";
import { TAGS } from "./tags.js";

export const REFLECT_HIDE = 0.35;        // extra push per blamed tag, × item weight × belief
export const REFLECT_IGNORE = 0.06;      // the ignored scroll, only when the system was sure
export const REFLECT_CREDIT = 0.18;      // a surprise like opens a stream
export const IGNORE_CONFIDENT = 0.4;     // expectation above this makes an ignore worth a note
const BLAME_CAP = 8, CREDIT_CAP = 6, RING = 12;
const SESSION_RATE = 2.5;                // mirrors index.js: session learns this much faster than long-term
const POSITIVE = new Set(["bag", "favorite", "save", "share"]);

const isDescriptor = (k) => !TAGS.includes(k) && k === k.toLowerCase();

export function reflectOn(profileBefore, item, action, { dwellMs = null } = {}) {
  const before = migrateProfile(profileBefore);
  const taste = tasteVector(before);
  const tags = item?.tags || {};
  const expectation = +vecSim(tags, taste).toFixed(3);
  const beliefs = Object.entries(tags)
    .filter(([, w]) => w > 0)
    .map(([tag, w]) => ({ tag, item: +Number(w).toFixed(3), belief: +(taste[tag] || 0).toFixed(3), descriptor: isDescriptor(tag) }));
  const out = { action, expectation, blamed: [], credited: [], note: "" };
  if (action === "hide") {
    out.blamed = beliefs.filter((b) => b.belief > 0.08).sort((a, b) => b.belief * b.item - a.belief * a.item).slice(0, BLAME_CAP)
      .map((b) => ({ ...b, push: +(-REFLECT_HIDE * b.item * (0.5 + b.belief)).toFixed(3) }));
    out.note = out.blamed.length
      ? `sent on ${out.blamed.slice(0, 3).map((b) => b.tag).join(", ")} — declined`
      : "declined a piece the system had no belief about";
  } else if (action === "skip") {
    if (expectation >= IGNORE_CONFIDENT) {
      out.blamed = beliefs.filter((b) => b.belief > 0.2).sort((a, b) => b.belief * b.item - a.belief * a.item).slice(0, 3)
        .map((b) => ({ ...b, push: +(-REFLECT_IGNORE * b.item).toFixed(3) }));
      out.note = `ignored a confident send (${expectation})`;
    } else {
      out.note = "an ignored scroll, weakly held";
    }
  } else if (POSITIVE.has(action)) {
    out.credited = beliefs.filter((b) => b.belief <= 0.05).sort((a, b) => b.item - a.item).slice(0, CREDIT_CAP)
      .map((b) => ({ ...b, push: +(REFLECT_CREDIT * b.item).toFixed(3) }));
    out.note = out.credited.length
      ? `a new stream opens: ${out.credited.slice(0, 3).map((b) => b.tag).join(", ")}`
      : expectation > 0.3 ? "sent well — the belief held" : "liked without a prior belief";
  }
  return out;
}

export function applyReflection(profile, reflection) {
  const p = migrateProfile(profile);
  if (!reflection) return p;
  for (const list of [reflection.blamed, reflection.credited]) {
    for (const b of list || []) {
      if (!b.push) continue;
      p.long[b.tag] = Math.max(-1, Math.min(1, (p.long[b.tag] || 0) + b.push));
      p.session[b.tag] = Math.max(-1, Math.min(1, (p.session[b.tag] || 0) + b.push * SESSION_RATE));
    }
  }
  if (reflection.blamed?.length || reflection.credited?.length) {
    const ring = Array.isArray(p._meta.reflections) ? p._meta.reflections : [];
    p._meta.reflections = [{
      t: Date.now(), a: reflection.action, e: reflection.expectation, n: reflection.note,
      b: (reflection.blamed || []).slice(0, 4).map((x) => x.tag),
      c: (reflection.credited || []).slice(0, 4).map((x) => x.tag),
    }, ...ring].slice(0, RING);
  }
  return p;
}

// The rows the shared stream map learns from: this person's strongest
// aesthetics × the piece's descriptors × what happened. Only descriptors —
// the ten aesthetics already live in the profile itself.
export function streamOutcomeRows(profileBefore, item, action) {
  const taste = tasteVector(migrateProfile(profileBefore));
  const tasteTags = TAGS.filter((t) => (taste[t] || 0) > 0.15).sort((a, b) => taste[b] - taste[a]).slice(0, 2);
  if (!tasteTags.length) return [];
  const outcome = action === "hide" ? "dislike" : action === "skip" ? "ignore" : POSITIVE.has(action) ? "like" : null;
  if (!outcome) return [];
  const rows = [];
  for (const [tag, w] of Object.entries(item?.tags || {})) {
    if (!isDescriptor(tag) || !(w > 0.15)) continue;
    for (const tasteTag of tasteTags) rows.push({ descriptor: tag, tasteTag, outcome });
  }
  return rows.slice(0, 64);
}
