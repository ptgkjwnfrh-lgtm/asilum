// tests/v2-feed-eq.test.js — THE FEED'S EQ (owner, 29 Oct 2026: "underneath the feed with the FOR YOU page select right
// next to it lets have a collapsed filter button that looks like its from a music player that allows users to change
// what types of cards show on their feed and at the bottom it has a remember toggle so it remebers its feed choices";
// lib/feed/choice.js, app/components/FeedEq.jsx, app/page.js).
//
// Declared before measuring:
//   - every kind of card the packer knows is on exactly one channel, except the ad space (not a card) and the echo
//     (on the rail above the stream); a channel muted takes all its kinds out of the stream and nothing else;
//   - the mix can never be empty: the last channel playing will not mute, and a stored or broken mix with none
//     comes back whole;
//   - REMEMBER keeps the mix on this device; off, nothing is kept, and turning it off forgets what was kept; a
//     broken or foreign stored value is no memory; the page reads the memory only after mount (the server renders
//     the whole Feed);
//   - the packer takes any mix, even a single small kind, without losing a card;
//   - the key sits first in the row of modes, before FOR YOU; its light is lit only while the mix is not the whole;
//     the panel opens under the row (the row scrolls sideways and clipped it), over the Feed's cards (they stack to
//     54) and under the fixtures, and closes on Escape and a click away (dismiss.js); faders and the hold switch
//     are buttons with their states named; reduced motion stops their slides.
//   Measured in the page, 375px light: muting PIECES and MUSIC took the 60 listings and 10 songs out and nothing else;
//   the key read "5 of 7 kinds playing"; nothing was stored until REMEMBER, which then kept the mix over a reload;
//   REMEMBER off cleared it; Escape and a click away closed the panel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANNELS, CHANNEL_KEYS, CHOICE_KEY, DEFAULT_CHOICE, normalChoice, allOn, toggleChannel, channelOf, filterFeed, readChoice, writeChoice } from "../lib/feed/choice.js";
import { CLASS_OF, SPANS, tetrisPack, kindOf } from "../lib/feed/tetris.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const eq = read("app/components/FeedEq.jsx");
const page = read("app/page.js");

const card = (kind, i) => {
  const id = kind + i;
  if (kind === "LISTING") return { id };
  if (kind === "PLACE") return { id, __place: { id } };
  if (kind === "SONG") return { id, __song: { id } };
  if (kind === "RAIL") return { id, __rail: [{}, {}] };
  if (kind === "AD") return { id, __ad: true };
  const post = { id, attachments: {} };
  if (kind === "STILL") post.imageUrl = "/x.jpg";
  if (kind === "CAROUSEL") { post.imageUrl = "/a.jpg"; post.images = ["/a.jpg", "/b.jpg"]; }
  if (kind === "MOTION") post.postKind = "video";
  if (kind === "BRDCST") post.attachments.event = { title: "t" };
  if (kind === "STILL+BRDCST") { post.imageUrl = "/x.jpg"; post.attachments.event = { title: "t" }; }
  if (kind === "MOTION+BRDCST") { post.postKind = "video"; post.attachments.event = { title: "t" }; }
  return { id, __post: post };
};

test("every kind on exactly one channel; an ad space and an echo on none", () => {
  const named = CHANNELS.flatMap((c) => c.kinds);
  assert.equal(new Set(named).size, named.length, "no kind on two channels");
  const kinds = Object.keys(CLASS_OF);
  assert.deepEqual([...named].sort(), [...kinds].sort(), "the channels name every sized kind");
  assert.deepEqual(Object.keys(SPANS).filter((k) => !named.includes(k)).sort(), ["AD", "ECHO"]);
  for (const k of [...kinds, "AD"]) assert.equal(kindOf(card(k, 0)), k, "the fixture builds a " + k);
  assert.equal(channelOf(card("AD", 0)), null);
  assert.deepEqual(CHANNEL_KEYS, ["stills", "motion", "listings", "notes", "brdcst", "places", "music"]);
  assert.equal(CHANNELS.find((c) => c.key === "notes").label, "NOTES", "words alone are NOTES (owner: \"rename it to notes\")");
  assert.deepEqual(normalChoice({ on: ["words", "music"] }).on, ["notes", "music"], "a mix kept as WORDS keeps its choice");
});

test("a muted channel takes its kinds out, and nothing else", () => {
  const all = ["STILL", "CAROUSEL", "STILL+BRDCST", "MOTION", "MOTION+BRDCST", "RAIL", "LISTING", "TRANSM", "BRDCST", "PLACE", "SONG", "AD"].flatMap((k) => [card(k, 1), card(k, 2)]);
  assert.equal(filterFeed(all, DEFAULT_CHOICE), all, "the whole Feed passes untouched");
  for (const ch of CHANNELS) {
    const out = filterFeed(all, { on: CHANNEL_KEYS.filter((k) => k !== ch.key) });
    assert.deepEqual(out.map((c) => c.id), all.filter((c) => !ch.kinds.includes(kindOf(c))).map((c) => c.id), "muting " + ch.key);
  }
  assert.ok(filterFeed(all, { on: ["music"] }).every((c) => ["SONG", "AD"].includes(kindOf(c))), "only music: the songs (and an ad space)");
});

test("never an empty mix", () => {
  assert.deepEqual(normalChoice({ on: [] }).on, CHANNEL_KEYS, "none comes back whole");
  assert.deepEqual(normalChoice({ on: ["nope", "music", "stills"] }).on, ["stills", "music"], "known channels, in their order");
  const one = { on: ["music"], remember: false };
  assert.deepEqual(toggleChannel(one, "music").on, ["music"], "the last one playing will not mute");
  assert.deepEqual(toggleChannel(one, "stills").on, ["stills", "music"]);
  assert.deepEqual(toggleChannel(DEFAULT_CHOICE, "places").on, CHANNEL_KEYS.filter((k) => k !== "places"));
  assert.ok(allOn(DEFAULT_CHOICE) && !allOn(one));
  assert.match(eq, /const last = on && c\.on\.length === 1;/);
  assert.match(eq, /onClick=\{\(\) => \{ if \(!last\) onChange\(toggleChannel\(c, ch\.key\)\); \}\}/);
});

test("REMEMBER keeps the mix on this device, and off forgets it", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const s = mem();
  writeChoice(s, { on: ["stills", "music"], remember: false });
  assert.equal(s.getItem(CHOICE_KEY), null, "off: nothing kept");
  writeChoice(s, { on: ["stills", "music"], remember: true });
  assert.deepEqual(readChoice(s), { on: ["stills", "music"], remember: true }, "on: kept, and read back");
  writeChoice(s, { on: ["stills", "music"], remember: false });
  assert.equal(s.getItem(CHOICE_KEY), null, "turned off: forgotten");
  s.setItem(CHOICE_KEY, "{broken");
  assert.deepEqual(readChoice(s), { on: CHANNEL_KEYS, remember: false }, "broken: no memory");
  s.setItem(CHOICE_KEY, JSON.stringify({ on: ["music"] }));
  assert.deepEqual(readChoice(s).on, CHANNEL_KEYS, "a value not marked remembered is no memory");
  assert.deepEqual(readChoice(null).on, CHANNEL_KEYS);
  const thrower = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.deepEqual(readChoice(thrower).on, CHANNEL_KEYS, "a private window: the whole Feed");
  assert.deepEqual(writeChoice(thrower, { on: ["music"], remember: true }).on, ["music"], "and the mix still holds for the visit");
  assert.match(page, /const \[mix, setMix\] = useState\(DEFAULT_CHOICE\);\n\s*useEffect\(\(\) => \{ try \{ setMix\(readChoice\(window\.localStorage\)\); \}/, "read after mount: the server renders the whole Feed");
});

test("the packer takes any mix without losing a card", () => {
  const all = ["STILL", "LISTING", "PLACE", "SONG", "BRDCST", "TRANSM", "MOTION", "CAROUSEL"].flatMap((k) => Array.from({ length: 6 }, (_, i) => card(k, i)));
  for (const on of [["music"], ["places"], ["brdcst"], ["listings"], ["stills", "music"], CHANNEL_KEYS]) {
    for (const cols of [6, 12, 18]) {
      const list = filterFeed(all, { on });
      const { cells } = tetrisPack(list, { cols });
      assert.deepEqual(cells.map((c) => c.card.id).sort(), list.map((c) => c.id).sort(), `${on.join("+")} at ${cols} columns`);
    }
  }
});

test("the key and the panel: at the right of THE FEED, the equaliser under it, closing as every transient surface does", () => {
  // (29 Oct 2026, last: "fuck the for you take that shit out and just leave the feed … put it in the right corner of
  // the screen inline with the fee[d]") the row of modes is gone; THE FEED and, at its right, the key — the source
  // (FOR YOU or FOLLOWING), the mix and the craving all live in it
  assert.match(page, /<header className="cthead">\s*<PageMast word="THE FEED" plain \/>\s*<FeedEq choice=\{mix\} onChange=\{changeMix\} source=\{tab === "following" \? "following" : "curated"\} onSource=\{switchTab\} craving=\{cravingOn\} onClearCraving=\{clearCraving\} \/>\s*<\/header>/, "THE FEED, then the key");
  assert.ok(!/<div className="fmodes seg">|className="fmode cur"|eqDock|FOR YOU<\/span>/.test(page), "no row of modes, no FOR YOU on the Feed");
  assert.match(css, /\.cthead > \.feq \{ margin-left: auto; \}/, "at the right");
  assert.match(eq, /export const SOURCES = Object\.freeze\(\[\["curated", "FOR YOU"\], \["following", "FOLLOWING"\]\]\);/);
  assert.match(eq, /role="radio" aria-checked=\{source === k\}/, "the source switch names its state");
  assert.match(eq, /onClick=\{\(\) => \{ if \(source !== k && onSource\) onSource\(k\); \}\}/);
  assert.match(eq, /\{craving \? \(\s*<div className="eqcraving">/, "the craving shows on the equaliser while it steers");
  assert.match(page, /const shown = filterFeed\(feedList\(list\)\.filter\(\(it\) => !hidden\.has\(String\(it\.id\)\)\), mix\);/, "the stream filtered before it is packed");
  assert.match(eq, /useEscape\(close, open\);/);
  assert.match(eq, /useClickAway\(panelRef, close, \{ active: open, excludeRef: wrapRef \}\);/, "a click away closes, the key toggles");
  assert.ok(!/createPortal|dock/.test(eq.replace(/\/\/[^\n]*/g, "")), "the equaliser hangs under the key, no dock");
  assert.match(eq, /aria-expanded=\{open\}/);
  assert.match(eq, /aria-pressed=\{on\}/);
  assert.match(eq, /role="switch"\s*aria-checked=\{c\.remember\}/);
  assert.match(eq, /className=\{"eqkey" \+ \(open \? " open" : ""\) \+ \(mixed \? " mixed" : ""\)\}/);
  assert.match(eq, /const mixed = !allOn\(c\) \|\| !!craving;/, "its light lit while the mix is not the whole, or a craving steers");
  assert.match(css, /\.eqkey\.mixed \.eqled \{ background: var\(--warn\); filter: var\(--key-glow-r\); \}/, "in the selected key's own glow");
  assert.match(css, /\.eqpanel \{ position: absolute; right: 0; top: calc\(100% \+ 8px\); z-index: 60;/, "under the key, from its right");
  assert.match(css, /\.feq \{ position: relative; z-index: 60;/, "over the cards (54), under the fixtures (64–66)");
  assert.match(css, /\.eqchan\.on \.eqknob \{ transform: none; \}/, "a fader up when it plays");
  assert.match(css, /\.eqknob \{[^}]*transform: translateY\(37px\);/, "down when muted, by transform (never layout)");
  assert.match(css, /\.eqhold\.on \.eqslide \{ transform: translateX\(14px\); \}/);
  assert.match(css, /\.eqpanel \{[^}]*border-radius: var\(--radius-card\);/, "on the radius scale");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.eqkey, \.eqknob, \.eqslide, \.eqslot, \.eqled, \.eqchled \{ transition: none; \} \.eqpanel \{ animation: none; \} \}/);
  assert.match(css, /\.eqkey:active, \.eqkey\.open \{ transform: scale\(0\.96\);/, "a compact key depresses 4%");
  // colours only through tokens in the component
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(eq), "no literal colour in FeedEq.jsx");
});
