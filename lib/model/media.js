// lib/model/media.js — SAMPLE MEDIA for the Live Launch V.2 model.
//
// The repository ships no photographs (audited 17 Sep: public/ holds fonts
// and a road map; catalog covers are generated gradients), and the rights
// register blocks runway/editorial imagery. These eight files are the ONLY
// exception, and they are here because their licences allow it: seven
// Unsplash-licensed photographs and one CC BY 4.0 portrait, each credited in
// public/model/credits.json and on every surface that shows one.
//
// They illustrate SAMPLE editorial posts so The Wire and the Front Cover
// open on media before the first person posts. Every sample is labelled
// SAMPLE EDITORIAL on screen, is never a listing, never a price, never a
// person's account. When the media pipeline lands, real posts replace them
// in the same card.
//
// ONE SAMPLE MOTION (slice 9): public/model/motion-test-pattern.mp4 is a
// SYNTHETIC test pattern drawn and encoded by scripts/make-motion-sample.swift
// (H.264 MP4, 320×180, six seconds, a generated 220 Hz test tone that swells
// and fades so nobody mistakes it for music) — the same kind of
// generated artefact as the catalog's gradient covers, so the housing can
// be exercised on a deployment with no video uploads. It is labelled
// GENERATED TEST PATTERN on every surface and is never a fashion film.

import { PLACES } from "../places/registry.js";
import { stillFor, stillImage } from "./stills.js";

// ONE SAMPLE CARRIES A BRDCST (owner's post-layout sketch, 19 Oct 2026: a
// media post with its BRDCST footer hung beneath). The event is the places
// register's own labelled fictional fixture, so the footer prints
// "SAMPLE FIXTURE" beside its date and nothing pretends to be real.
const SAMPLE_EVENT = PLACES.find((p) => p.id === "sample-oasis-dc") || null;
// the strip BRDCSTs: a post that is only an event (lib/feed/types.js postType)
const SAMPLE_BRDCSTS = ["sample-justice-live", "sample-indie-sleaze-night"]
  .map((id, i) => { const ev = PLACES.find((p) => p.id === id); return ev ? { id: "sample-b" + (i + 1), sample: true, intent: "curate", category: "movement", handle: "asilum", name: "ASILUM", title: ev.name, text: ev.note, tags: ev.tags, attachments: { event: ev } } : null; })
  .filter(Boolean);

// (25 Oct 2026, late) EVERY PICTURE IS A DARK BLUE STILL (lib/model/stills.js):
// the free-use photographs are gone at the owner's word; nothing here is a
// photograph, so nothing here carries a credit.

export const SAMPLE_MOTION = Object.freeze({
  id: "sample-motion-1", generated: true, url: "/model/motion-test-pattern.mp4", poster: null,
  durationMs: 6000, width: 320, height: 180, rotation: 0, codec: "avc1", container: "mp4", audio: true,
  captions: [{ lang: "en", label: "English (description)", default: true, src: "/model/motion-test-pattern.vtt" }],
});

export const sampleImage = (key) => stillImage(key);

export const WIRE_CATEGORIES = Object.freeze([
  { id: "style", label: "STYLE" },
  { id: "film", label: "FILM & ART" },
  { id: "food", label: "FOOD & RITUAL" },
  { id: "movement", label: "MOVEMENT" },
  { id: "commentary", label: "COMMENTARY" },
  { id: "runway", label: "RUNWAY" },
]);

export const WIRE_INTENTS = Object.freeze([
  { id: "create", label: "CREATE", means: "original work — an outfit, a film, a plate, a dance" },
  { id: "curate", label: "CURATE", means: "a thoughtful selection, with attribution" },
  { id: "interpret", label: "INTERPRET", means: "context that adds meaning — a breakdown, a reading" },
]);

// [handle, title, text, tags, picture key] — the model's reader, more of it
const MORE_STILLS = [
  ["no_emos_allowed", "Parka weather.", "Fishtail, hood up, nothing loud underneath. The coat that outlived three tours and two band splits.", ["UTILITARIAN", "ARCHIVAL"], "parka-green"],
  ["hedi_era_03", "The narrowest lapel in the room.", "A 2005 jacket, a white shirt, a thin black tie. The silhouette is the whole idea; the rest is restraint.", ["ARCHIVAL", "TAILORED"], "lapel-black"],
  ["sleaze_archive_07", "Wayfarers at 4am.", "The flash went off, the party kept going. A door, a borrowed blazer, a night nobody remembers the same way.", ["STATEMENT", "INDEPENDENT"], "flash-night"],
  ["eames_and_iron", "Plywood, bent properly.", "The side chair in a white room. Moulded wood is tailoring for furniture — the curve has to fit the person.", ["MINIMAL", "ARCHIVAL"], "plywood-chair"],
  ["industrial_notes", "Steel shelving, honest.", "Bolted uprights, a concrete wall, the boots lined up underneath. Storage that admits what it is.", ["UTILITARIAN", "MINIMAL"], "steel-shelf"],
  ["fontaines_fc", "A Dublin raincoat.", "Grey wool, collar up, a paperback in the pocket. The band's wardrobe is a library card and a long walk.", ["ARCHIVAL", "INDEPENDENT"], "raincoat-grey"],
  ["justice_cross_", "Two crosses and a chain.", "Silver against black leather, one hung lower than the other. The record sleeve, worn.", ["AVANT-GARDE", "STATEMENT"], "cross-chain"],
  ["crate_digger_dc", "The last copy in the bin.", "Sleeve corners soft, the sticker half off, a price in pencil. Found at the bottom of the third crate.", ["INDEPENDENT", "ARCHIVAL"], "record-crates"],
  ["liam_g_94", "Bucket hat, no apologies.", "Navy, slightly too big, pulled low. The hat that said the gig was the only thing on that weekend.", ["UTILITARIAN", "STATEMENT"], "bucket-navy"],
  ["no_emos_allowed", "Desert boots on wet stone.", "Crepe soles and a terraced street. They were never meant for rain and they went anyway.", ["ARCHIVAL", "UTILITARIAN"], "desert-boot"],
  ["hedi_era_03", "Black jeans, one cut.", "The same pair in four years of photographs. Find the leg that works and stop looking.", ["MINIMAL", "TAILORED"], "denim-black"],
  ["industrial_notes", "A factory lamp over a desk.", "Enamel shade, a cloth cord, one bulb. Light that was built for work and still does it.", ["UTILITARIAN", "MINIMAL"], "lamp-room"],
  ["eames_and_iron", "The lounge chair at dusk.", "Rosewood and leather in a room going dark. Furniture you can sit with, not just in.", ["MINIMAL", "ARCHIVAL"], "lounge-room"],
  ["sleaze_archive_07", "Skinny scarf, long night.", "Knotted twice, ends uneven, a cigarette burn near the hem. Proof of attendance.", ["STATEMENT", "INDEPENDENT"], "scarf-night"],
  ["fontaines_fc", "Cardigan, buttoned once.", "Oatmeal knit over a collared shirt, the top button done. Quietly dressed, loudly played.", ["ARCHIVAL", "TAILORED"], "cardigan-oat"],
  ["crate_digger_dc", "Headphones on the counter.", "Closed-back, cable coiled, the shop's test pair. Ten seconds of a track decides everything.", ["INDEPENDENT", "MINIMAL"], "headphones"],
];
// [handle, title, text, tags, picture keys] — two more carousels for Figure 20
const MORE_CAROUSELS = [
  ["eames_and_iron", "Five chairs, one room.", "A sample carousel: the lounge chair, the side chair, a stool, a bench, a steel stacking chair. Swipe; the ends tuck outward.", ["MINIMAL", "ARCHIVAL"], ["lounge-room", "plywood-chair", "stool-oak", "bench-steel", "stack-chair"]],
  ["sleaze_archive_07", "One night, six frames.", "A sample carousel from a single night out: the queue, the cloakroom, the floor, the bar, the stairs, the street at dawn.", ["STATEMENT", "INDEPENDENT"], ["queue-night", "cloakroom", "floor-lights", "bar-dark", "staircase", "street-dawn"]],
];
// [handle, title, text] — more motions, each the one generated test pattern
const MORE_MOTIONS = [
  ["asilum", "The housing, again.", "The same generated test pattern in a second MOTION card, so the row of videos you may like has more than one to turn through. Not a film."],
  ["asilum", "Test pattern, third take.", "A generated test pattern, not footage: it stands in for a motion until the first one is uploaded."],
  ["asilum", "Bars and tone.", "The generated test pattern once more — a fixture for the player and the row, never a fashion film."],
];

// Each sample rides the same shape a real transmission does on the wire
// (title, text, tags as hashtags) plus `sample: true`, `image` and `credit`.
export const SAMPLE_POSTS = Object.freeze([
  // THE MODEL'S FEED (owner, 25 Oct 2026): an Oasis, Fontaines D.C., Hedi
  // Slimane, indie sleaze, Justice reader who likes Eames and industrial
  // furniture. Every author here is a fixture, every picture a dark blue
  // still (stills.js); the one BRDCST is the register's fictional
  // concert, so the footer prints SAMPLE FIXTURE beside its date.
  {
    id: "sample-w1", sample: true, intent: "interpret", category: "style",
    handle: "no_emos_allowed", name: "no_emos_allowed", avatar: stillFor("record-orange"),
    title: "Live forever, dressed properly.",
    text: "Parka, Gazelles, a good coat over it. The Oasis uniform was never a costume — it was what you already owned, worn with intent. A reading of the terrace wardrobe before the November show.",
    tags: ["UTILITARIAN", "ARCHIVAL"], image: sampleImage("fabric"),
    ...(SAMPLE_EVENT ? { attachments: { event: SAMPLE_EVENT } } : {}),
  },
  {
    // a sample CAROUSEL (owner's feed sketch, 25 Oct 2026: a post of several
    // stills appears as Figure 20): six rooms the model's reader would go to
    id: "sample-w9", sample: true, intent: "curate", category: "film",
    handle: "liam_g_94", name: "liam_g_94", avatar: stillFor("berghain"),
    title: "Six rooms, one weekend.",
    text: "A sample carousel: the turbine hall, a gallery, a staircase, a bar after midnight, a dining room, a hall under lights. Swipe through; the frames at either end turn in as they arrive.",
    tags: ["ARCHIVAL", "STATEMENT"],
    image: sampleImage("turbine-hall"),
    images: ["turbine-hall", "moma", "staircase", "bar-dark", "restaurant", "printworks"].map(sampleImage),
  },
  {
    id: "sample-w2", sample: true, intent: "interpret", category: "style",
    handle: "hedi_era_03", name: "hedi_era_03", avatar: stillFor("leather-jacket"),
    title: "Skinny, black, done.",
    text: "Dior Homme 2001–2007, then Saint Laurent: one silhouette, pulled tighter each season. The jacket is the whole argument — everything else is just what you wear under it.",
    tags: ["ARCHIVAL", "SEDUCTIVE"], image: sampleImage("leather-jacket"),
  },
  {
    // a second carousel (owner, 25 Oct 2026: "I see no carousels"): the watches, six of them in Figure 20
    id: "sample-w10", sample: true, intent: "curate", category: "style",
    handle: "fontaines_fc", name: "fontaines_fc", avatar: stillFor("watch-gmt"),
    title: "Six watches, one wrist.",
    text: "A sample carousel of the model's watches — a dive watch, a Tank, a chronograph, a GMT, two in gold and steel. Swipe; the ends turn in as they arrive.",
    tags: ["ARCHIVAL", "TAILORED"],
    image: sampleImage("submariner"),
    images: ["submariner", "tank", "speedmaster", "watch-gmt", "watch-gold", "watch-steel"].map(sampleImage),
  },
  {
    id: "sample-w3", sample: true, intent: "curate", category: "commentary",
    handle: "sleaze_archive_07", name: "sleaze_archive_07", avatar: stillFor("sunglasses-red"),
    title: "Flash on. 2007 forever.",
    text: "Disposable cameras, a borrowed blazer, Wayfarers indoors. The look was cheap and the nights were long. Three references from the door of a club at four in the morning.",
    tags: ["STATEMENT", "INDEPENDENT"], image: sampleImage("fabric-door"),
  },
  {
    id: "sample-w4", sample: true, intent: "interpret", category: "film",
    handle: "eames_and_iron", name: "eames_and_iron", avatar: stillFor("plywood-chair"),
    title: "Sit on something that was designed.",
    text: "The lounge chair in a room that earns it: bare floor, one lamp, nothing else asking for attention. Furniture is clothing for a room — the same rules about proportion apply.",
    tags: ["MINIMAL", "ARCHIVAL"], image: sampleImage("lounge-room"),
  },
  {
    id: "sample-w5", sample: true, intent: "curate", category: "commentary",
    handle: "justice_cross_", name: "justice_cross_", avatar: stillFor("cross-chain"),
    title: "† on the turntable.",
    text: "A 2007 first pressing on a 1979 deck. The cross, the distortion, the leather jacket that goes with it — a listening note, not a review.",
    tags: ["AVANT-GARDE", "STATEMENT"], image: sampleImage("technics"),
  },
  {
    id: "sample-w6", sample: true, intent: "create", category: "food",
    handle: "crate_digger_dc", name: "crate_digger_dc", avatar: stillFor("technics"),
    title: "Crates before coffee.",
    text: "Sunday method: flip every sleeve, pull nothing until the end. A still from a short film about a record room and the people who keep it.",
    tags: ["INDEPENDENT", "ARCHIVAL"], image: sampleImage("record-crates"),
  },
  {
    id: "sample-w7", sample: true, intent: "interpret", category: "style",
    handle: "industrial_notes", name: "industrial_notes", avatar: stillFor("lantern"),
    title: "One lamp is enough.",
    text: "Cage lanterns, raw steel, a concrete floor. The industrial room and the industrial wardrobe share a rule: the material does the talking, so leave it alone.",
    tags: ["UTILITARIAN", "MINIMAL"], image: sampleImage("lamp-room"),
  },
  {
    id: "sample-w8", sample: true, intent: "create", category: "movement",
    handle: "asilum", name: "ASILUM",
    title: "The housing, exercised.",
    text: "A generated test pattern in the MOTION housing: tap for the controls, double-tap a side to seek, CC for the creator's captions, the speed and the quality settings, KEEP AUDIO to hand its test tone to the music circle. Not a film — a fixture so the player can be seen before the first upload.",
    tags: ["MINIMAL", "UTILITARIAN"], video: SAMPLE_MOTION,
  },
  // MORE OF THE SAME READER'S FEED (owner, 26 Oct 2026: "I want there to be a
  // majority of stills and motions on the feed"): every author a fixture,
  // every picture a still (stills.js), every motion the one generated test
  // pattern (SAMPLE_MOTION) — no film is invented
  ...MORE_STILLS.map(([handle, title, text, tags, key], i) => ({
    id: "sample-s" + (i + 1), sample: true, intent: i % 3 ? "curate" : "interpret", category: ["style", "film", "commentary", "movement"][i % 4],
    handle, name: handle, avatar: stillFor(handle), title, text, tags, image: sampleImage(key),
  })),
  ...MORE_CAROUSELS.map(([handle, title, text, tags, keys], i) => ({
    id: "sample-c" + (i + 1), sample: true, intent: "curate", category: "style",
    handle, name: handle, avatar: stillFor(handle), title, text, tags, image: sampleImage(keys[0]), images: keys.map(sampleImage),
  })),
  ...MORE_MOTIONS.map(([handle, title, text], i) => ({
    id: "sample-m" + (i + 1), sample: true, intent: "create", category: "movement",
    handle, name: handle, avatar: stillFor(handle), title, text, tags: ["MINIMAL", "UTILITARIAN"], video: SAMPLE_MOTION,
  })),
  // two standalone BRDCSTs (owner: "make up concert and event pop-ups"):
  // posts that carry only an event, drawn as the full-width strip
  ...SAMPLE_BRDCSTS,
]);

/** A sample post's category as the hashtag a real post would carry. */
export const categoryTag = (id) => "#" + id;

/** Read a real transmission's category/intent back out of its hashtags. */
export function readPostRefs(tags = []) {
  const set = new Set((tags || []).map((t) => String(t).replace(/^#/, "").toLowerCase()));
  const category = WIRE_CATEGORIES.find((c) => set.has(c.id))?.id || null;
  const intent = WIRE_INTENTS.find((i) => set.has(i.id))?.id || null;
  return { category, intent };
}
