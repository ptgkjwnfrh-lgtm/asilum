// tests/v2-discover-craving.test.js — NOTES, THE UPLOAD SYMBOLS, THE CRAVING IN THE SEARCH TAB, DISCOVER (owner, 29 Oct
// 2026: "rename it to notes and add that to the upload selection, also make custom upload symbols for the selection.
// the collaspable togge thing should replace current craving and following and the toggle should be on the left. and
// current cravings should live in search tab. we have to device a way for a quick button to take users to a discover
// page that makes sense because of how our search toggle works").
//
// Declared before measuring:
//   - words alone are NOTES in the upload selection (the composer's kind unchanged) and every upload type wears its
//     own symbol, drawn in the house hand (one thin stroke, no fill), none borrowed from another key;
//   - the craving is one for the app: kept for this visit only (sessionStorage, never localStorage), every value one
//     the Feed knows, a broken one none, an empty one forgotten, and every open page told; the Feed follows it and
//     no longer holds its own form;
//   - the search popup waits for typing, so the deck's search bar carries DISCOVER (the global search only), and the
//     empty search popup a line, both opening the DISCOVER popup — a view of the one popup, never a page — which
//     holds the craving, the rails (a reading tapped is searched in the search tab; none, it says so), and the way
//     to the whole inventory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRAVING_KEY, CRAVING_EVENT, EMPTY_CRAVING, OCCASIONS, MOODS, normalCraving, cravingActive, readCraving, pointCraving } from "../lib/craving.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("NOTES in the upload selection, and a symbol of its own for every type", () => {
  const sel = read("app/components/PostSelection.jsx"), icons = read("app/components/Icons.jsx");
  const types = [...sel.matchAll(/\{ id: "(\w+)", label: "([A-Z]+)", icon: "([\w-]+)", means: "([^"]+)" \}/g)].map((m) => m.slice(1));
  assert.deepEqual(types.map((t) => t[1]), ["NOTES", "STILL", "MOTION", "BRDCST", "LISTING", "ECHO"]);
  assert.equal(types[0][0], "transm", "the composer's kind is unchanged");
  const glyph = (name) => { const m = icons.match(new RegExp('\\n  "' + name + '": (<g \\{\\.\\.\\.P\\}>[^\\n]*</g>),')); return m && m[1]; };
  const drawn = types.map(([, , icon]) => { assert.match(icon, /^up-/, icon + " is an upload symbol"); const g = glyph(icon); assert.ok(g, icon + " is drawn"); return g; });
  assert.equal(new Set(drawn).size, drawn.length, "six different drawings");
  for (const g of drawn) assert.ok(!/fill=|strokeWidth=/.test(g), "in the house hand: the one thin stroke, no fill");
  for (const old of ['icon: "list"', 'icon: "stamp"', 'icon: "feed"', 'icon: "locate"', 'icon: "bag"', 'icon: "disc"']) assert.ok(!sel.includes(old), "no borrowed key: " + old);
  assert.match(read("app/components/PostCards.jsx"), /<Icon name=\{t\.icon\} size=\{22\} \/>/, "the POST cards wear them");
  assert.match(read("app/components/PostCard.jsx"), /type === "TRANSM" \? "note"/, "a note is read aloud as a note");
});

test("the craving: one for the app, for this visit, every value one the Feed knows", () => {
  assert.deepEqual(normalCraving({ text: "  dark dinner  ", occasion: "date", mood: "nope", novelty: "wildcard" }), { text: "dark dinner", occasion: "date", mood: "", novelty: "wildcard" });
  assert.equal(normalCraving({ text: "x".repeat(400) }).text.length, 240);
  assert.deepEqual(normalCraving(null), EMPTY_CRAVING);
  assert.ok(!cravingActive(EMPTY_CRAVING) && cravingActive({ mood: "quiet" }) && cravingActive({ novelty: "safe" }));
  assert.ok(OCCASIONS.includes("travel") && MOODS.includes("nostalgic"));
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const heard = [];
  const target = { dispatchEvent: (e) => heard.push(e) };
  const s = mem();
  pointCraving({ text: "airport armor", occasion: "travel" }, { storage: s, target });
  assert.deepEqual(readCraving(s), { text: "airport armor", occasion: "travel", mood: "", novelty: "discovery" }, "kept for the visit");
  assert.equal(heard.length, 1); assert.equal(heard[0].type, CRAVING_EVENT); assert.equal(heard[0].detail.text, "airport armor", "every open page told");
  pointCraving(EMPTY_CRAVING, { storage: s, target });
  assert.equal(s.getItem(CRAVING_KEY), null, "an empty craving is forgotten");
  s.setItem(CRAVING_KEY, "{broken"); assert.deepEqual(readCraving(s), EMPTY_CRAVING, "a broken one is none");
  const lib = strip(read("lib/craving.js"));
  assert.ok(/window\.sessionStorage/.test(lib) && !/localStorage/.test(lib), "this visit only, never kept on the device");
});

test("the Feed follows the craving and no longer holds its form", () => {
  const page = read("app/page.js");
  assert.match(page, /const \[craving, setCraving\] = useState\(EMPTY_CRAVING\);/);
  assert.match(page, /const held = readCraving\(window\.sessionStorage\); if \(cravingActive\(held\)\) setCraving\(held\);/, "the visit's craving, read after mount");
  assert.match(page, /window\.addEventListener\(CRAVING_EVENT, heard\);/, "and a new one heard");
  assert.match(page, /if \(craving\.text\) qs\.set\("craving", craving\.text\);/, "the Feed's request carries it, as before");
  assert.ok(!/cravingDraft|cravingOpen|applyCraving|POINT THE WAY|className="cravinggrid"/.test(page), "the form left the Feed");
  assert.match(page, /\{cravingOn && \(\s*<button className="txtbtn" onClick=\{clearCraving\}>CRAVING ON · CLEAR<\/button>/, "while one steers, the row says so and can clear it");
  assert.match(page, /function clearCraving\(\) \{ pointCraving\(EMPTY_CRAVING\); \}/, "cleared here, cleared everywhere");
});

test("DISCOVER: a key in the search bar, a line in the empty search popup, one popup view", () => {
  const cc = read("app/components/ControlCenter.jsx");
  assert.match(cc, /\{scope\.id === "global" \? \(\s*<button type="button" className=\{"ccdiscover" \+ [^\n]*\} onClick=\{\(\) => \{ haptic\("press"\); openSheet\("discover", \{ title: "DISCOVER" \}\); \}\} aria-label="discover: browse without typing">/, "the global search bar's own key");
  assert.match(cc, /<Icon name="compass" size=\{18\} \/><span className="ccdisclbl">DISCOVER<\/span>/);
  const search = read("app/components/SearchSheet.jsx");
  assert.match(search, /\{!q && <button type="button" className="srchall srchdisc" onClick=\{\(\) => \{ haptic\("press"\); pushSheet\("discover", \{ title: "DISCOVER" \}\); \}\}>OR DISCOVER WITHOUT TYPING →<\/button>\}/, "the empty search popup leads there too");
  const host = read("app/components/SheetHost.jsx");
  assert.match(host, /discover: \{ title: "DISCOVER", render: \(p\) => <DiscoverSheet \{\.\.\.p\} \/> \},/, "a view of the one popup, never a page");
  const ds = read("app/components/DiscoverSheet.jsx");
  assert.match(ds, /const c = pointCraving\(draft\);/, "POINT THE WAY sets the app's craving");
  assert.match(ds, /<DiscoverRails onPickTags=\{pick\} empty=\{<p className="srchfine">/, "the rails, and when there are none it says so");
  assert.match(ds, /setQuery\(words\);\s*pushSheet\("search", \{ title: "SEARCH" \}\);/, "a reading tapped is searched in the search tab");
  assert.match(ds, /<a className="srchall" href="\/discover">THE WHOLE INVENTORY →<\/a>/);
  const rails = read("app/components/DiscoverRails.jsx");
  assert.match(rails, /if \(!data\) return null;\s*if \(!data\.rails\?\.length\) return empty;/, "nothing invented when no reviewed source stands behind a rail");
  assert.match(css, /\.ccdiscover \{[^}]*border: 1px solid color-mix\(in srgb, var\(--ink\) 14%, transparent\);/, "ringed as the field is");
  assert.match(css, /\.ccdiscover:active \{ transform: scale\(0\.96\); \}/);
  assert.match(cc, /className=\{"ccdiscover" \+ \(String\(dock\.q \|\| ""\)\.trim\(\) \? " folded" : ""\)\}/, "folded to its compass once something is typed");
  assert.match(css, /\.ccdiscover\.folded \.ccdisclbl \{ position: absolute; width: 1px;/, "the field takes the room");
  assert.match(css, /@media \(max-width: 340px\) \{ \.ccdisclbl \{ position: absolute; width: 1px;/, "only the smallest screens keep the compass alone, the name for assistive technology");
  assert.match(css, /\.discsheet \.railhead \{ flex-wrap: wrap; row-gap: 4px; \}/, "the rails fit the popup");
});
