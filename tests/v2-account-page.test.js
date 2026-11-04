// tests/v2-account-page.test.js — THE ACCOUNT PAGE, RE-UPPED (owner's
// sketch, 4 Nov 2026: "pretty much close to Instagram — next to the message
// button is the wardrobe button, statistics button, banking button; beneath
// that is echos and beneath that is posts, reposts, featured, store front").
// Held here:
//   * the header is ONE component on the owner's page and a passenger's
//     public page: the title, the avatar with the room's SONG, the handle
//     with the Passenger Score as stars, POSTS · LISTINGS · FOLLOWERS ·
//     FOLLOWING, the bio, the key row, the echoes;
//   * the three keys open the owner's panels; the four tabs are the four
//     drawn, each a glyph over its word; REPOSTS says it is not wired;
//   * FOLLOWERS is a real count, by handle, the count only — never the list;
//   * the storefront's hash and tab stay as the storefront tests expect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setFollow, followerCount } from "../lib/db/production.js";
import { housing, SLANT_RUN, REF } from "../lib/wordmark.js";
import { callRoute, loadRoute } from "./helpers/route.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const uuid = () => globalThis.crypto.randomUUID();

test("the follower count: distinct followers of a handle, case-folded, without the mark; the count only", async () => {
  const h = "r" + uuid().slice(0, 8);
  assert.equal(await followerCount(h), 0, "an unfollowed handle counts zero — a measurement of an empty table");
  const A = "sb-" + uuid(), B = "sb-" + uuid();
  await setFollow(A, "user", h, true);
  await setFollow(B, "user", h.toUpperCase(), true);
  await setFollow(B, "brand", h, true);
  assert.equal(await followerCount(h), 2, "two people, however the handle was cased; a brand follow is not a follower");
  assert.equal(await followerCount("*" + h), 2, "the friend mark is not part of the handle");
  await setFollow(A, "user", h, false);
  assert.equal(await followerCount(h), 1, "an unfollow leaves");
  assert.equal(await followerCount(""), 0);
});

test("the route: GET ?followers=<handle> is public and answers the count; a bad handle is refused", async () => {
  const follow = await loadRoute("app/api/follow/route.js");
  const h = "r" + uuid().slice(0, 8);
  await setFollow("sb-" + uuid(), "user", h, true);
  const r = await callRoute(follow.GET, { path: "/api/follow", query: { followers: h } });
  assert.equal(r.status, 200, "no identity is needed to read a public count");
  assert.deepEqual(r.body, { handle: h, followers: 1 });
  assert.equal((await callRoute(follow.GET, { path: "/api/follow", query: { followers: "*x" } })).status, 400);
  assert.equal((await callRoute(follow.GET, { path: "/api/follow", query: { followers: "" } })).status, 400);
});

test("one header for both pages: the title, the song, the stars, the four counts, the keys, the echoes", () => {
  const head = read("app/components/ProfileHead.jsx");
  for (const must of [
    'export default function ProfileHead(',
    'export function ProfileTabs(', 'export function PostGrid(', 'export function useFollowers(', 'export function ScoreStars(',
    '<span className="pf3songword">SONG</span>',                 // the song under the avatar
    'openSheet("score", { subject, name, title: "PASSENGER SCORE" })', // the stars open the score popup
    'className={"pf3star" + (i <= lit ? " on" : "")}',            // five stars, the rounded score lit
    'aria-label="echoes — temporary posts, gone after 24 hours"',
    'openSheet("echo", { handle, echoes:',                        // a ring opens the ECHO viewer
    '.filter((p) => echoLive(p))',                                // only live echoes are rings
  ]) assert.ok(head.includes(must), must);

  const own = read("app/profile/page.js");
  const pub = read("app/u/[handle]/page.js");
  for (const src of [own, pub]) {
    assert.match(src, /import ProfileHead, \{ ProfileTabs, PostGrid, useFollowers \} from/);
    assert.match(src, /title=\{<h1 className="pf3title">/, "the display name is the page's heading");
    for (const label of ['label: "POSTS"', 'label: "LISTINGS"', 'label: "FOLLOWERS"', 'label: "FOLLOWING"']) assert.ok(src.includes(label), label);
    assert.ok(src.includes('reposting is not built yet — nothing here is a measurement.'), "REPOSTS is honest about its absence");
  }
  // the owner's page: EDIT PROFILE, MESSAGE, the three keys; the + ring composes an ECHO
  assert.match(own, /\["wardrobe", "WARDROBE", "wardrobe"\], \["stats", "STATISTICS", "stats"\], \["bank", "BANKING", "bank"\]/);
  assert.match(own, /<a className="pf3key" href="\/messages">MESSAGE<\/a>/);
  assert.match(own, /onEchoAdd=\{\(\) => openSheet\("post", \{ kind: "echo", title: "POST" \}\)\}/);
  assert.match(own, /onSong=\{\(\) => openPanel\("room"\)\}/, "the song key opens the room, where the anthem is set");
  // the public page: FOLLOW and MESSAGE to the mail desk on that person; the song links to the catalog
  assert.match(pub, /<FollowButton handle=\{handle\} \/>/);
  assert.match(pub, /new CustomEvent\("asilum:dm-open", \{ detail: \{ handle \} \}\)/);
  assert.match(pub, /songHref=\{anthem \? "\/discover\?q=" \+ encodeURIComponent\(anthem\.name\) : null\}/);
  assert.match(pub, /tab === "featured" && <PublicRoom room=\{room\} handle=\{handle\} \/>/, "FEATURED is the room's record");
});

test("the four tabs, each a glyph over its word, and the panels the three keys open", () => {
  const own = read("app/profile/page.js");
  assert.match(own, /const TABS = \[\["posts", "POSTS"\], \["reposts", "REPOSTS"\], \["featured", "FEATURED"\], \["storefront", "STOREFRONT"\]\];/);
  assert.match(own, /TAB_ICONS = Object\.freeze\(\{ posts: "grid", reposts: "repost", featured: "featured", storefront: "store" \}\)/);
  const icons = read("app/components/Icons.jsx");
  const names = [...icons.matchAll(/^  ([a-z]+): <g /gm)].map((m) => m[1]);
  for (const n of ["grid", "repost", "featured", "store", "wardrobe", "stats", "bank"]) assert.ok(names.includes(n), "glyph " + n);
  const head = read("app/components/ProfileHead.jsx");
  assert.match(head, /<Icon name=\{icons\[k\]\} size=\{20\} \/>\s*<span>\{label\}<\/span>/, "every tab glyph carries its readable word");
  // the panels take the sheet's place and come back to the profile
  assert.match(own, /\{panel === "wardrobe" && <WardrobeTab \/>\}/);
  assert.match(own, /\{panel === "stats" && \(\s*<StatsPanel/);
  assert.match(own, /\{panel === "bank" && <BankPanel/);
  assert.match(own, /<button type="button" className="pf3back" onClick=\{\(\) => setPanel\(null\)\}>← PROFILE<\/button>/);
  // STATISTICS: BRDCSTs, follower information, storefront information — each from a record
  assert.match(own, /brdcsts = posts\.filter\(\(p\) => postType\(p\) === "BRDCST"\)/);
  assert.match(own, /<li><span>LIVE LISTINGS<\/span><b>\{live\}<\/b><\/li>/);
  // BANKING: the storefront's own fee ledger, not a recomputation
  assert.match(own, /<EarningsPanel fee=\{env\.fee\} orders=\{env\.orders\} \/>/);
  assert.match(read("app/components/StorefrontTab.jsx"), /export function EarningsPanel\(\{ fee, orders \}\)/);
  // the reset link and #access still open ACCOUNT, now a panel
  assert.match(own, /if \(window\.location\.hash === "#access"\) setPanel\("account"\);/);
  assert.match(own, /setPanel\("account"\);\s*if \(failed\) \{/);
});

test("the key brick is the logo's brick, mirrored: square at the right, the slant at the drawn angle through the bends down to the line on the left", () => {
  // (4 Nov 2026: "pay attention to the shape the Asilum logo is in … the housing … to look like that shape"; then
  // "flipped horizontally so that the buttons stay where they are, they just now have the shape encasing it")
  assert.ok(Math.abs(SLANT_RUN - (REF.toe - REF.shoulder) / (REF.lineTop - REF.brickTop)) < 1e-9, "the slant is the reference's");
  const g = housing(700, 98, { side: "right", line: 3, bend: 8, lineRun: 280, shoulder: 240 });
  assert.match(g.d, /^M700 0 H/, "square at the right edge, where it runs off the pane");
  assert.match(g.d, / H0 V98 H700 Z$/, "the line runs on to the left edge and drops to the foot");
  assert.equal(g.line, 95, "the line is `line` thick, flush with the foot");
  assert.equal(g.shoulder, 240, "the shoulder is where the cluster asked for it");
  assert.ok(Math.abs((g.toe - g.shoulder) / g.line - SLANT_RUN) < 1e-3, "room enough: the slant keeps the drawn angle");
  assert.equal(g.shoulderX, 700 - 240); assert.ok(g.toeX > 280 - 1e-9, "the toe stops short of the left keys");
  assert.ok(Math.abs(g.at(0) - g.shoulderX) < 0.01 && Math.abs(g.at(g.line) - g.toeX) < 0.01, "at(y) walks the slant leftward");
  assert.equal(g.at(1000), g.at(g.line), "and never past the toe");
  // too little room for the drawn angle: the toe stops at the line's end and the slant steepens
  const p = housing(354, 80, { side: "right", line: 2.5, bend: 6, lineRun: 14, shoulder: 300 });
  assert.ok(p.toe <= 354 - 14 + 1e-9 && (p.toe - p.shoulder) / p.line < SLANT_RUN, "steeper than drawn rather than losing the line");
  // the logo's own way still stands
  const l = housing(700, 98, { line: 3, bend: 8 });
  assert.match(l.d, /^M0 0 H/); assert.ok(Math.abs((l.toe - l.shoulder) / l.line - SLANT_RUN) < 1e-3);
  assert.equal(housing(300, 0).line, 0, "a flat box does not go negative");
});

test("the cluster is encased in the brick on the owner's page, the left keys stand on its line, the banner fades out before the slant, and EDIT PROFILE sets it", () => {
  const brick = read("app/components/KeyBrick.jsx");
  assert.match(brick, /import \{ housing, SLANT_RUN \} from "\.\.\/\.\.\/lib\/wordmark\.js"/, "the brick is drawn from the logo's own geometry");
  assert.match(brick, /new ResizeObserver\(read\)/, "drawn to the measured row, so the angle holds at every width");
  assert.match(brick, /housing\(m\.w, m\.h, \{ side: "right", line, bend, lineRun, shoulder: want \}\)/, "the slab on the right, its shoulder from the cluster's edge");
  assert.match(brick, /const lineRun = Math\.max\(breath, m\.leftRight \+ breath\);/, "the toe stops short of the left keys");
  assert.match(brick, /<path className="kbslab" d=\{g\.d\} \/>/);
  assert.match(brick, /<stop offset="0" stopColor="#000" \/>\s*<stop offset="1" stopColor="#fff" \/>/, "the banner ends in a gradient");
  assert.match(brick, /preserveAspectRatio="xMidYMid slice" clipPath=\{`url\(#\$\{id\}c\)`\} mask=\{`url\(#\$\{id\}m\)`\}/, "clipped to the brick, masked by the fade");
  assert.match(brick, /const bare = !right && !banner;/, "nothing to encase and no banner: the keys stand on the line alone");
  const head = read("app/components/ProfileHead.jsx");
  assert.match(head, /<KeyBrick className="pf3keys" banner=\{banner\} left=\{actions\} right=\{tools\} \/>/);
  const own = read("app/profile/page.js");
  assert.match(own, /tools=\{tools\}/); assert.match(own, /banner=\{info\.bannerImg \|\| null\}/);
  assert.match(own, /onClick=\{\(\) => pickImage\("bannerImg", 1400\)\}>⇪ BANNER<\/button>/);
  const css = read("app/globals.css");
  assert.match(css, /\.kbslab \{ fill: var\(--wm-bar\);/, "the brick is the logo's white");
  assert.match(css, /\.kbart \{[^}]*filter: var\(--wm-glow\)/, "in the logo's glow");
  assert.match(css, /--kb-ink: #001512;/, "the cluster in the logo's black");
  assert.match(css, /\.kbleft \{[^}]*padding: 0 0 var\(--kb-line, 3px\) var\(--kb-pad, 20px\); \}/, "the left keys stand on the line");
});
