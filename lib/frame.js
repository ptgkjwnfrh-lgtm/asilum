// lib/frame.js — ONE FRAME FOR EVERYTHING THE SCROLL MOVES (owner, 29 Oct 2026: "checking the tracking of everything,
// animations, reactions, effects, timing so everything is much cleaner"). Measured that evening at 375px, a 300-frame
// scroll: five reactions each ran their own frame callback — the logo's tint, the ground's ink, the EQ key's return,
// the deck's shrink, the motion row's play — each reading the page and then writing to it, so a later one's reads
// came after an earlier one's writes and made the browser lay the page out again inside the same frame; the logo's
// tint alone took 2.7ms a frame on average (11.7 at worst), 93% of all of it, much of that paying for the others.
// Now they share one frame: every reader reads, then every writer writes — the page is laid out once, before any of
// them changes it. A subscriber is { read(), write(result) }; it is asked on every scroll (the page's and a
// carousel's, by capture), every resize, and whenever one of them asks (requestFrame).

const subs = new Set();
let raf = 0;
let listening = false;

// a measurement hook: with globalThis.__frameProfile set to an object, each subscriber's read and write time (ms) is
// added to it under its name — how the frame's cost is found and kept honest
function timed(name, part, fn) {
  const prof = globalThis.__frameProfile;
  if (!prof || typeof performance === "undefined") return fn();
  const t = performance.now();
  try { return fn(); } finally { const k = (name || "?") + "." + part; prof[k] = (prof[k] || 0) + performance.now() - t; }
}

function tick() {
  raf = 0;
  const reads = [];
  for (const s of subs) {
    let r;
    try { r = s.read ? timed(s.name, "read", () => s.read()) : undefined; } catch { r = undefined; }
    reads.push([s, r]);
  }
  for (const [s, r] of reads) {
    try { if (s.write) timed(s.name, "write", () => s.write(r)); } catch { /* one subscriber failing never stops the others */ }
  }
}

/** Ask for a frame: one at most, whoever asks. */
export function requestFrame() {
  if (raf || typeof requestAnimationFrame !== "function") return;
  raf = requestAnimationFrame(tick);
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("scroll", requestFrame, { passive: true, capture: true });
  window.addEventListener("resize", requestFrame);
}

/** Join the frame; returns the way out. */
export function subscribeFrame(sub) {
  subs.add(sub);
  listen();
  requestFrame();
  return () => { subs.delete(sub); };
}

/** For the tests: run one frame now, and how many are subscribed. */
export function runFrameNow() { if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); raf = 0; tick(); }
export function frameSubscribers() { return subs.size; }
