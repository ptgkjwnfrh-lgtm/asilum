// tests/v2-sessions.test.js — V.2 SLICE 2: the popup grammar, the popup TABS
// and the Disc, as the markup and the dock state wire them (owner's
// blueprint, 17 Oct 2026, chapters 1 and 2). The ten-session hub's face was
// taken away on 27 Oct 2026 ("lets get rid of the ten tabs that are hidden")
// and its laws kept ("when i back out of a tab the tab must remain what i
// last left it as, even if i was halfway searching … where i stopped
// scrolling should be the place i should return to … i simply just dont want
// the session subtabs as a confusing feature"). The Disc's pure laws are in
// tests/disc.test.js. Source reads where a .jsx cannot be imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import * as D from "../lib/dockstate.js";
import { HAPTICS_KEY, PATTERNS } from "../lib/haptics.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const dockstate = read("lib/dockstate.js");
const host = read("app/components/SheetHost.jsx");
const deck = read("app/components/ControlCenter.jsx");
const disc = read("app/components/Disc.jsx");
const postsel = read("app/components/PostSelection.jsx");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

// Declared before measuring (27 Oct 2026):
//   - every popup belongs to a tab, named by the view it was opened as and what it was opened on (never by
//     its caption); dismissing keeps the tab as it was, and opening it again resumes it — the detail that
//     was up; over a popup a new one extends that tab; Back walks down it, and from its first view dismisses
//     and keeps it;
//   - where each view was scrolled is kept with it;
//   - the words of a search stay when the deck leaves search (each scope its own), and SEARCH gives them
//     back with the search tab resumed;
//   - nothing is saved before this device's tabs are read, a read never opens a popup, and what the retired
//     hub saved is cleared;
//   - every view of every tab stays mounted out of sight (hidden, inert, still laid out), keyed so a tab
//     moving to the front never remounts the ones behind it.
test("the tabs: dismissing keeps a tab as it was left, and opening it again resumes it", () => {
  D.openSheet("likes");
  D.pushSheet("listing", { id: 7, title: "A COAT" });
  const key = D.getDock().sheet.key;
  D.rememberScroll(key, 1, 340);
  D.closeSheet();
  assert.equal(D.getDock().sheet, null, "dismissed: no popup on screen");
  D.openSheet("messages");
  assert.equal(D.getDock().sheet.id, "messages", "another tab opens fresh");
  D.closeSheet();
  D.openSheet("likes");
  const s = D.getDock().sheet;
  assert.equal(s.id, "listing", "Likes resumes on the detail that was up");
  assert.equal(s.top.scroll, 340, "with its scroll");
  D.backSheet();
  assert.equal(D.getDock().sheet.id, "likes", "Back walks down the tab");
  D.backSheet();
  assert.equal(D.getDock().sheet, null, "from its first view Back dismisses");
  D.openSheet("likes");
  assert.equal(D.getDock().sheet.stack.length, 1, "and the tab is kept as it was");
  D.openSheet("bag");
  assert.equal(D.getDock().sheet.stack.length, 2, "over a popup a new one extends the tab (1.28)");
  D.closeSheet();
  assert.equal(D.tabKey("listing", { id: 7, title: "A" }), D.tabKey("listing", { title: "B", id: 7 }), "a tab is named by what it shows, not its caption");
  assert.notEqual(D.tabKey("listing", { id: 7 }), D.tabKey("listing", { id: 8 }));
});

test("the half-typed search: the words stay when the deck leaves search, each scope its own, and come back", () => {
  D.setScope("global");
  D.setMode("search");
  D.setQuery("rick ow");
  D.openSheet("search");
  D.closeSearch();
  assert.equal(D.getDock().mode, "base");
  assert.equal(D.getDock().sheet, null);
  D.setScope("messages");
  assert.equal(D.getDock().q, "", "another scope's search starts with its own words");
  D.setQuery("hello");
  D.setScope("global");
  assert.equal(D.wordsOf(D.getDock(), "messages").q, "hello", "kept while the field is elsewhere");
  D.setMode("search");
  assert.equal(D.getDock().q, "rick ow", "SEARCH gives the half-typed words back");
  assert.equal(D.getDock().sheet && D.getDock().sheet.id, "search", "with the search tab resumed");
  D.closeSearch();
  const likes = read("app/components/LikesSheet.jsx");
  assert.match(likes, /const q = dock\.mode === "search" \? String\(dock\.q \|\| ""\)\.trim\(\)\.toLowerCase\(\) : "";/, "Likes filters by them only while searching");
  assert.match(read("app/components/SearchSheet.jsx"), /const words = wordsOf\(dock, "global"\);/, "the search popup reads the global search's own words");
  assert.match(deck, /useEffect\(\(\) => \{ setScope\(scope\.id\); \}, \[scope\.id\]\);/, "the deck tells the dock its scope");
});

test("the tabs on this device: saved once read, never popped open by a read, the retired hub's keys cleared", () => {
  const body = strip(dockstate);
  assert.match(body, /export const TABS_KEY = "asilum-tabs-v1";/);
  assert.match(body, /if \(typeof window === "undefined" \|\| !state\.hydrated\) return;/, "never overwrite what was not read");
  const hydrate = body.slice(body.indexOf("export function hydrateTabs"), body.indexOf("export function rememberScroll"));
  assert.ok(!/state\.active\s*=/.test(hydrate), "a read never opens a popup");
  assert.match(hydrate, /forgetSessions\(\);/);
  assert.match(body, /export const RETIRED_KEYS = Object\.freeze\(\["asilum-sessions-v2", "asilum-session-previews"\]\);/);
  assert.match(strip(host), /useEffect\(\(\) => \{ hydrateTabs\(\); \}, \[\]\);/, "the host reads them on mount");
});

test("the tabs kept alive: every view stays mounted out of sight — hidden, inert, still laid out — so its state and scroll hold", () => {
  const body = strip(host);
  assert.match(body, /alive\.flatMap\(\(tab\) => tab\.stack\.map\(\(entry, i\) => \{/, "one flat list (nested lists are keyed by position and would remount)");
  assert.match(body, /key=\{tab\.key \+ "#" \+ i \+ ":" \+ entry\.view\}/, "each view keyed by its tab and place");
  assert.match(body, /export const ALIVE = 6;/);
  assert.match(body, /aria-hidden=\{live \? undefined : true\} inert=\{live \? undefined : true\} onScroll=\{onScroll\}/, "out of sight: hidden and inert");
  assert.match(body, /rememberScroll\(tabKey, index, ref\.current\.scrollTop\)/, "its scroll remembered");
  assert.match(body, /<div className="sheetscrim" data-kept=\{open \? undefined : "1"\}/, "a dismissed popup is kept, not unmounted");
  assert.match(css, /\.sheetpane:not\(\[data-live\]\) \{ visibility: hidden; pointer-events: none; \}/, "laid out, so the scroll holds");
  assert.match(css, /\.sheetscrim\[data-kept\] \{ visibility: hidden; pointer-events: none; \}/);
  assert.ok(!/\.sheetscrim\[data-kept\][^{]*\{[^}]*display: none/.test(css), "never display: none, which would lose the scroll");
  assert.match(read("app/components/dismiss.js"), /!el\.closest\("\[inert\]"\)/, "the focus trap skips the kept views");
});

test("the popup's gesture grammar (1.2): swipe down from the header dismisses, swipe right goes back, a tap outside never closes a heavy popup", () => {
  const body = strip(host);
  assert.match(body, /if \(s && e\.clientY - s\.y > SWIPE_DOWN\) dismiss\(\);/);
  assert.match(body, /if \(e\.clientX - s\.x > SWIPE_BACK && Math\.abs\(e\.clientY - s\.y\) < 40\) backSheet\(\);/);
  assert.match(body, /if \(open && e\.target === e\.currentTarget && lightweight\) dismiss\(\);/, "a tap outside an open, lightweight popup (the kept one is out of reach)");
  assert.match(body, /checkout: \{[^}]*heavy: true/, "a payment page is heavy");
  assert.match(body, /post: \{.*heavy: true/, "an edit in progress is heavy");
  assert.match(body, /document\.documentElement\.dataset\.popup = "1";/, "the root is marked while a popup is up");
  assert.match(css, /\[data-popup\] \.fixture \{ opacity: 0\.55;/, "the fixtures go translucent (1.12); the Masthead spans the page, so it does not shrink (26 Oct 2026)");
});

test("no session machinery on screen: no hub, no carousel, no 01/10 counter, no New Session — the Post disc is the plus", () => {
  const body = strip(deck);
  assert.ok(!existsSync(new URL("../lib/sessions.js", import.meta.url)) && !existsSync(new URL("../app/components/SessionCarousel.jsx", import.meta.url)), "the hub's model and carousel are gone");
  assert.ok(!/toggleHub|openHub|newSession|sessionCount|cccount|ccsessions|NEW SESSION|"SESSIONS"|LONG_PRESS_MS|ccmenu/.test(body), "the plus is not a session indicator");
  assert.match(body, /if \(popupUp\) \{ closeSheet\(\); setCards\(true\); return; \}/, "over a popup the plus closes it and brings up the POST cards");
  assert.match(body, /const popupUp = !!dock\.sheet;/);
  assert.match(body, /aria-label="post"/);
  assert.ok(!/sessions:\s*\{/.test(strip(host)) && !/sheetcount/.test(strip(host)), "no sessions view, no counter in the popup");
  assert.ok(!/\.(sesspanel|hubmenu|ccmenu|cccount|sheetcount|hubsheet)\b|\.ccsessions/.test(css), "and none of their styles");
});

test("the FEED key twice (1.13, 1.14): the first tap dismisses the popup, the second refreshes and scrolls to the top", () => {
  const body = strip(deck);
  assert.match(body, /if \(dock\.sheet\) \{ e\.preventDefault\(\); closeSheet\(\); return; \}/);
  assert.match(body, /new CustomEvent\("asilum:feed-refresh"\)/);
  assert.match(body, /window\.scrollTo\(\{ top: 0/);
});

test("the Disc: pointer physics from lib/disc.js, the centre confirms, the dwell ring, reduced motion drops momentum, off is a slim slider", () => {
  const body = strip(disc);
  assert.match(body, /stepMomentum\(st, n, dt\)/, "the frame loop runs the tested physics");
  assert.match(body, /e\.stopPropagation\(\);\s*pressRef\.current/, "the centre is a button, not the start of a turn");
  assert.match(body, /if \(next\.tick\) haptic\("tick"\);/, "a tick as it snaps (2.1)");
  assert.match(body, /velocity: reduced\.current \? 0 : d\.velocity/, "reduced motion: no momentum");
  assert.match(body, /strokeDashoffset=\{ring \* \(1 - progress\)\}/, "the dwell ring fills");
  assert.match(body, /type="range"/, "off: a slim slider (2.10)");
  assert.match(body, /prefKey\(name\)/, "the preference is per interface (2.7)");
  assert.match(body, /ArrowLeft|ArrowRight/, "the keyboard turns it");
  assert.match(body, /onLongPress/, "the centre's long hold");
});

test("Post Selection: the six types on the disc; LISTING and ECHO say `soon` and never pretend", () => {
  const body = strip(postsel);
  for (const t of ["TRANSM", "STILL", "MOTION", "BRDCST", "LISTING", "ECHO"]) assert.match(body, new RegExp('label: "' + t + '"'));
  assert.match(body, /className="fine soon postsoon"/);
  assert.match(body, /pushSheet\("post", \{ kind: t\.id, title: t\.label \}\)/, "a type opens the one composer");
  assert.ok(!/fetch\(/.test(body), "nothing is faked with a request");
});

test("haptics: navigator.vibrate behind one On/Off key, never a required dependency", () => {
  assert.equal(HAPTICS_KEY, "asilum-haptics");
  assert.ok(PATTERNS.tick && PATTERNS.press && PATTERNS.confirm);
  const body = strip(read("lib/haptics.js"));
  assert.match(body, /navigator\.vibrate/);
  assert.match(body, /try \{/, "a device without vibration is not an error");
});
