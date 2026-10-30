// tests/v2-frame.test.js — ONE FRAME FOR EVERYTHING THE SCROLL MOVES, AND THE TIMINGS (owner, 29 Oct 2026: "checking the
// tracking of everything, animations, reactions, effects, timing so everything is much cleaner"; lib/frame.js).
//
// Declared before measuring:
//   - the shared frame runs every reader before any writer (no read after a write, so no layout forced twice), asks for
//     one frame however many ask, keeps going when one subscriber throws, and lets go when asked;
//   - every reaction to the scroll joins it — the logo's tint, the ground's ink, the EQ key's return, the deck's shrink,
//     the motion row's play — and none keeps a frame loop of its own;
//   - a script timer that waits on a CSS motion waits as long as it: the POST card's grow;
//   - measured at 375px, a 300-frame scroll: the frame's script time a median of at most half and a 95th percentile of
//     at most half the 2.3 / 8.2 ms it was; no more dropped frames; the tint agreeing with the eight-point hit test it
//     replaced in at least 95% of frames, its edges within 2px. Measured after: median 0.2–0.3ms, p95 0.4ms; 1 dropped
//     frame in 300 (as before); the tint 2.9ms → 0.05ms a frame; 392 of 400 frames agreed, the edges in 73 of 73.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("every reader reads before any writer writes; one frame however many ask; a failure stays its own", async () => {
  const queued = [];
  globalThis.requestAnimationFrame = (cb) => { queued.push(cb); return queued.length; };
  globalThis.cancelAnimationFrame = () => {};
  const { subscribeFrame, requestFrame, runFrameNow, frameSubscribers } = await import("../lib/frame.js?" + Date.now());
  const log = [];
  const a = subscribeFrame({ name: "a", read: () => { log.push("read a"); return 1; }, write: (v) => log.push("write a " + v) });
  const b = subscribeFrame({ name: "b", read: () => { throw new Error("broken"); }, write: () => log.push("write b") });
  const c = subscribeFrame({ name: "c", read: () => { log.push("read c"); return 3; }, write: (v) => log.push("write c " + v) });
  assert.equal(frameSubscribers(), 3);
  requestFrame(); requestFrame(); requestFrame();
  assert.equal(queued.length, 1, "one frame asked for, however many ask");
  runFrameNow();
  assert.deepEqual(log, ["read a", "read c", "write a 1", "write b", "write c 3"], "all the reads, then all the writes; the broken read leaves the others");
  a(); b(); c();
  assert.equal(frameSubscribers(), 0, "they let go");
  delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
});

test("every scroll reaction joins the one frame, and keeps no loop of its own", () => {
  for (const [file, name] of [["app/components/Wordmark.jsx", "logo-tint"], ["app/components/GroundInk.jsx", "ground-ink"], ["app/components/FeedEq.jsx", "eq-return"], ["app/components/ControlCenter.jsx", "deck-shrink"], ["app/components/MotionRail.jsx", "motion-play"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`subscribeFrame\\(\\{\\s*name: "${name}",`), name + " joins the frame");
  }
  for (const file of ["app/components/Wordmark.jsx", "app/components/GroundInk.jsx", "app/components/FeedEq.jsx", "app/components/MotionRail.jsx"]) {
    assert.ok(!/addEventListener\("scroll"/.test(read(file)), file + " listens to no scroll of its own");
  }
  const frame = read("lib/frame.js");
  assert.match(frame, /window\.addEventListener\("scroll", requestFrame, \{ passive: true, capture: true \}\);/, "the page's scroll and a carousel's");
  assert.match(frame, /globalThis\.__frameProfile/, "and how its cost is measured");
  // the motion row tells a video to play or pause only on a change
  assert.match(read("app/components/MotionRail.jsx"), /if \(now === was\) \{[\s\S]*?return;\s*\}/); // unchanged: only a refused centre video is asked again (bug run)
});

test("a timer waiting on a CSS motion waits as long as the motion", () => {
  const css = read("app/globals.css");
  const dur = (n) => Number(css.match(new RegExp(`--dur-${n}: (\\d+)ms;`))[1]);
  assert.match(css, /\.pccard \{[^}]*transition: transform var\(--dur-3\) var\(--ease-out\)/s, "the POST card grows over --dur-3");
  const grow = Number(read("app/components/PostCards.jsx").match(/export const GROW_MS = (\d+);/)[1]);
  assert.equal(grow, dur(3), "the popup waits for the grow to end (it waited 260 for a 320ms grow)");
});
