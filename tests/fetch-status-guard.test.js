// tests/fetch-status-guard.test.js — a ratchet on trap 13.
//
// Trap 13, from 16 August: "gating a route turns every unchecked `r.json()` on
// its callers into a rendered lie. When you gate a route, grep its callers."
// `/api/stats` was gated, `/cover` read it without `r.ok`, and a truthy
// `401 {error}` body became the data — the masthead printed `undefined` four
// times. That instance was fixed. **The sweep was never done**, and this file
// is the sweep, kept running.
//
// 31 routes can answer 401/403. Nineteen client reads of them parse the body
// without ever looking at the status, and the pattern is uniform:
//
//     .then((d) => setBagHistory(d.bagHistory || []))
//
// On a 401 the body parses perfectly well, `d.bagHistory` is undefined, and the
// page renders an empty bag. The reader is told they have no orders when the
// truth is that we could not establish who they are — the same rendered lie as
// the `undefined` masthead, only quieter, because an empty list looks like an
// answer. A `.catch(() => null)` on the `.json()` does NOT count as a guard: it
// catches a PARSE failure, and a 401 error body parses fine.
//
// THIS TEST DOES NOT ASSERT THE COUNT IS ZERO. Nineteen call sites is a real
// change to how eight pages behave when auth fails, and what each should do
// instead — hold prior state, retry, surface something — is a product decision,
// not a mechanical one. So this is a ratchet: the recorded numbers may FALL
// without touching this file, and any rise fails. Fixing a page means lowering
// its number here; adding a twentieth unguarded read is caught the same day.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// file → how many unguarded reads of a gated route it had on 17 August.
// Lower these as pages are fixed. Never raise one to make this pass.
const BASELINE = {
  "app/board/page.js": 8,
  "app/cover/page.js": 2,
  "app/orders/page.js": 2,
  "app/page.js": 2,
  "app/profile/page.js": 2,
  "app/hotlist/page.js": 1,
  "app/stats/page.js": 1,
  "app/upload/page.js": 1,
};

function walk(dir, out = []) {
  for (const entry of readdirSync(ROOT + dir)) {
    const rel = `${dir}/${entry}`;
    if (statSync(ROOT + rel).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

// A route is "gated" if it can answer 401 or 403 — i.e. its body can be an
// error object that parses exactly as cleanly as the real payload.
function gatedRoutes() {
  const set = new Set();
  for (const f of walk("app/api").filter((p) => p.endsWith("route.js"))) {
    if (/status:\s*40[13]/.test(readFileSync(ROOT + f, "utf8"))) {
      set.add("/api/" + f.replace(/^app\/api\//, "").replace(/\/route\.js$/, ""));
    }
  }
  return set;
}

function unguardedByFile() {
  const gated = gatedRoutes();
  const counts = {};
  const files = walk("app").filter((p) => /\.(js|jsx)$/.test(p) && !p.endsWith("route.js"));
  for (const f of files) {
    const lines = readFileSync(ROOT + f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/\.json\(\)/.test(line)) return;
      if (/NextResponse|req\.json|request\.json/.test(line)) return;
      // The fetch and any status check sit just above the parse.
      const win = lines.slice(Math.max(0, i - 8), i + 3).join("\n");
      if (/\.ok\b/.test(win) || /\.status\s*[=!]==?/.test(win) || /res\.status/.test(win)) return;
      const m = win.match(/["'`](\/api\/[a-z0-9/_-]+)/i);
      const ep = m ? m[1] : null;
      if (!ep) return;
      const hitsGated = [...gated].some((g) => ep === g || ep.startsWith(g + "?") || ep.startsWith(g + "/"));
      if (hitsGated) counts[f] = (counts[f] || 0) + 1;
    });
  }
  return counts;
}

test("no page gains a new unguarded read of a gated route", () => {
  const found = unguardedByFile();
  const problems = [];

  for (const [file, n] of Object.entries(found)) {
    const allowed = BASELINE[file] ?? 0;
    if (n > allowed) {
      problems.push(`${file}: ${n} unguarded reads, baseline ${allowed}`
        + (allowed === 0 ? " — a NEW page is parsing a gated route without checking status" : ""));
    }
  }

  assert.deepEqual(problems, [], "check `res.ok` before parsing: a 401 body parses fine and renders as empty state");
});

test("the ratchet reports when a page has been FIXED, so the baseline follows", () => {
  // A stale baseline is a silent licence for the next regression: a file listed
  // at 8 that has been fixed to 0 would let eight new ones back in unnoticed.
  const found = unguardedByFile();
  const stale = Object.entries(BASELINE)
    .filter(([file, n]) => (found[file] ?? 0) < n)
    .map(([file, n]) => `${file}: baseline ${n}, now ${found[file] ?? 0} — lower it`);

  assert.deepEqual(stale, [], "a page improved; tighten its baseline in this file");
});

test("the detector still finds the shape it was written for", () => {
  // If `gatedRoutes()` ever returns nothing — a refactor moves the 401s behind
  // a helper, say — every assertion above passes by finding zero of everything.
  // That is this file's own trap 22, so the preconditions are asserted.
  const gated = gatedRoutes();
  assert.ok(gated.size >= 20, `expected many gated routes, found ${gated.size}`);
  assert.ok(gated.has("/api/boards") && gated.has("/api/orders"),
    "the routes this sweep was built around must still be recognised as gated");
  assert.ok(Object.keys(unguardedByFile()).length > 0,
    "detector found nothing at all — it has stopped working, not the code stopped being wrong");
});
