// lib/brain/memory.js
// FORGETTING, made visible. learn() applies per-interaction decay — but a
// profile untouched for a week should fade on the clock, not only when the
// user interacts. This layer adds:
//   * idle time-decay with a configurable half-life (long + session vectors)
//   * FORGET EVENTS: when a long-term tag's |weight| slips under the floor it
//     is removed and logged to _meta.forgotten (the viz renders red/snapping)
//   * an activity ring buffer (_meta.activity) the viz renders white (thinking)
// All state rides in the profile's reserved _meta field, so it persists with
// the profile and never pollutes bridge math.
//
// NOTE: deliberately imports nothing heavy — vizState() runs in the browser
// and must not drag the catalog into the client bundle.

const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 6;  // taste half-life: 6 idle days
const FORGET_FLOOR = 0.04;                      // |w| below this → forgotten
const ACTIVITY_MAX = 30;
const FORGOT_MAX = 20;

const TASTE_LONG = 0.6;    // must mirror lib/brain/index.js blend weights
const TASTE_SESSION = 0.4;

// Minimal local copy of the v2 migration (no index.js import — see NOTE).
function toV2(raw) {
  if (!raw) return { long: {}, session: {}, _meta: {} };
  if (raw.long || raw.session) {
    return { long: { ...(raw.long || {}) }, session: { ...(raw.session || {}) }, _meta: { ...(raw._meta || {}) } };
  }
  const long = {};
  for (const k in raw) if (k.charAt(0) !== "_") long[k] = raw[k];
  return { long, session: {}, _meta: { ...(raw._meta || {}) } };
}

// Apply clock-based decay. Mutates nothing; returns { profile, forgotten }.
export function applyTimeDecay(profileRaw, now = Date.now()) {
  const p = toV2(profileRaw);
  const meta = p._meta;
  const last = meta.lastActive || now;
  const dt = now - last;
  const forgotten = [];

  if (dt > 60_000) {
    const factor = Math.pow(0.5, dt / HALF_LIFE_MS);
    for (const vecName of ["long", "session"]) {
      const vec = p[vecName];
      for (const k in vec) {
        const before = vec[k] || 0;
        const after = before * factor;
        if (Math.abs(before) >= FORGET_FLOOR && Math.abs(after) < FORGET_FLOOR) {
          if (vecName === "long") forgotten.push({ tag: k, w: before, t: now });
          delete vec[k];
        } else {
          vec[k] = after;
        }
      }
    }
  }

  meta.lastActive = now;
  if (forgotten.length) {
    meta.forgotten = [...forgotten, ...(meta.forgotten || [])].slice(0, FORGOT_MAX);
  }
  return { profile: p, forgotten };
}

// Record an interaction into the activity ring buffer (for the viz).
// kind: "favorite" | "save" | "share" | "bag" | "purchase" | "dwell" | "skip" | "hide"
export function noteActivity(profileRaw, item, kind, now = Date.now()) {
  const p = toV2(profileRaw);
  let tag = null, best = 0;
  for (const k in (item && item.tags) || {}) {
    if (item.tags[k] > best) { best = item.tags[k]; tag = k; }
  }
  p._meta.activity = [{ tag, kind, t: now }, ...(p._meta.activity || [])].slice(0, ACTIVITY_MAX);
  p._meta.lastActive = now;
  return p;
}

// Everything the visualization needs, in one read.
export function vizState(profileRaw) {
  const p = toV2(profileRaw);
  const weights = {};
  for (const k in p.long) weights[k] = p.long[k] * TASTE_LONG;
  for (const k in p.session) weights[k] = (weights[k] || 0) + p.session[k] * TASTE_SESSION;
  return {
    weights,
    recent: p._meta.activity || [],
    forgotten: p._meta.forgotten || [],
    streakTag: p._meta.streakTag || null,
    fatigue: p._meta.fatigue || 0,
  };
}
