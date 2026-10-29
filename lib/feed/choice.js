// lib/feed/choice.js — THE FEED'S MIX, the reader's own (owner, 29 Oct 2026: "underneath the feed with the FOR YOU
// page select right next to it lets have a collapsed filter button that looks like its from a music player that
// allows users to change what types of cards show on their feed and at the bottom it has a remember toggle so it
// remebers its feed choices"). Pure: app/components/FeedEq.jsx draws the channels, app/page.js filters the stream
// before it is packed (lib/feed/tetris.js), and the choice is kept on this device only when REMEMBER is on.
//
// The channels are the kinds a reader can name (lib/feed/types.js, lib/feed/tetris.js kindOf), grouped as they read
// on the Feed: a carousel is stills, the motion row is motion, a post carrying a BRDCST is its media's. An ad space
// is not a card and is never filtered; an ECHO rides the rail above the stream, not in it. At least one channel is
// always on — a Feed of nothing is no choice.

import { kindOf } from "./tetris.js";

export const CHANNELS = Object.freeze([
  Object.freeze({ key: "stills", label: "STILLS", kinds: Object.freeze(["STILL", "CAROUSEL", "STILL+BRDCST"]) }),
  Object.freeze({ key: "motion", label: "MOTION", kinds: Object.freeze(["MOTION", "MOTION+BRDCST", "RAIL"]) }),
  Object.freeze({ key: "listings", label: "PIECES", kinds: Object.freeze(["LISTING"]) }),
  Object.freeze({ key: "words", label: "WORDS", kinds: Object.freeze(["TRANSM"]) }),
  Object.freeze({ key: "brdcst", label: "BRDCST", kinds: Object.freeze(["BRDCST"]) }),
  Object.freeze({ key: "places", label: "PLACES", kinds: Object.freeze(["PLACE"]) }),
  Object.freeze({ key: "music", label: "MUSIC", kinds: Object.freeze(["SONG"]) }),
]);
export const CHANNEL_KEYS = Object.freeze(CHANNELS.map((c) => c.key));

/** Where a remembered choice is kept on this device (nowhere when REMEMBER is off). */
export const CHOICE_KEY = "asilum-feed-choice";

/** Every channel on, nothing remembered: the Feed as it comes. */
export const DEFAULT_CHOICE = Object.freeze({ on: CHANNEL_KEYS, remember: false });

/** A choice made whole: only known channels, in their order, never none (then all); remember a plain yes/no. */
export function normalChoice(v) {
  const want = v && Array.isArray(v.on) ? new Set(v.on) : new Set(CHANNEL_KEYS);
  const on = CHANNEL_KEYS.filter((k) => want.has(k));
  return { on: on.length ? on : [...CHANNEL_KEYS], remember: !!(v && v.remember === true) };
}

/** Whether every channel is on (the button's light stays dark then). */
export const allOn = (choice) => normalChoice(choice).on.length === CHANNEL_KEYS.length;

/** A channel switched: off if on, on if off — except the last one on, which stays (never an empty Feed). */
export function toggleChannel(choice, key) {
  const c = normalChoice(choice);
  if (!CHANNEL_KEYS.includes(key)) return c;
  const on = c.on.includes(key) ? c.on.filter((k) => k !== key) : CHANNEL_KEYS.filter((k) => k === key || c.on.includes(k));
  return on.length ? { ...c, on } : c;
}

const CHANNEL_OF = new Map(CHANNELS.flatMap((c) => c.kinds.map((k) => [k, c.key])));
/** The channel a card plays on; null for what no channel names (an ad space, an echo), which always shows. */
export const channelOf = (card) => CHANNEL_OF.get(kindOf(card)) || null;

/** The cards the choice lets through, in order. */
export function filterFeed(cards, choice) {
  if (!Array.isArray(cards)) return cards;
  const c = normalChoice(choice);
  if (c.on.length === CHANNEL_KEYS.length) return cards;
  const on = new Set(c.on);
  return cards.filter((card) => { const ch = channelOf(card); return !ch || on.has(ch); });
}

/** The choice this device remembered, or the default. A broken or foreign value is no memory. */
export function readChoice(storage) {
  try {
    const raw = storage && storage.getItem(CHOICE_KEY);
    if (!raw) return { ...DEFAULT_CHOICE, on: [...CHANNEL_KEYS] };
    const v = JSON.parse(raw);
    return v && v.remember === true ? normalChoice(v) : { ...DEFAULT_CHOICE, on: [...CHANNEL_KEYS] };
  } catch {
    return { ...DEFAULT_CHOICE, on: [...CHANNEL_KEYS] };
  }
}

/** Keep the choice on this device when REMEMBER is on; forget it the moment REMEMBER goes off. */
export function writeChoice(storage, choice) {
  const c = normalChoice(choice);
  try {
    if (!storage) return c;
    if (c.remember) storage.setItem(CHOICE_KEY, JSON.stringify(c));
    else storage.removeItem(CHOICE_KEY);
  } catch { /* a private window: the choice holds for this page view */ }
  return c;
}
