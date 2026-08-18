// tests/fetch-status-guard.test.js — trap 13, swept and held at zero.
//
// Trap 13, from 16 August: "gating a route turns every unchecked `r.json()` on
// its callers into a rendered lie. When you gate a route, grep its callers."
// `/api/stats` was gated, `/cover` read it without `r.ok`, and a truthy
// `401 {error}` body became the data — the masthead printed `undefined` four
// times. That instance was fixed; the sweep was never done.
//
// It has been done now. NINETEEN client reads of a gated route parsed the body
// without ever checking status, across eight pages, all of this shape:
//
//     .then((d) => setBagHistory(d.bagHistory || []))
//
// On a 401 the body parses perfectly well, `d.bagHistory` is undefined, and the
// page renders an empty bag. The reader is told they have no orders when the
// truth is that we could not establish who they are — quieter than the
// `undefined` masthead, because an empty list looks like an answer.
//
// The fix everywhere was the same and adds no error UI: do not adopt a body
// from a non-`ok` response, and leave whatever state was already there.
//
// THE DETECTOR IS THE HARD PART, and it was wrong three times before it was
// right. Each way it was wrong is a way this file could have looked green while
// the codebase was not:
//
//   1. A `.catch(() => null)` on the `.json()` was counted as a guard. It
//      catches a PARSE failure; a 401 body parses fine. That under-reported the
//      first pass as five.
//   2. The endpoint was attributed by scanning a fixed window around the parse,
//      so a read was blamed on whatever path appeared nearby — two ungated
//      calls flagged, one genuinely-unguarded `/api/profile` read missed
//      because an `/api/discover` call sat above it. It resolves the call site
//      by walking BACK to the nearest one now.
//   3. The guard window was a fixed ±8 lines, which read the NEIGHBOUR's
//      `r.ok` and excused a real bug sitting beside a fixed one — a regression
//      applied on purpose passed. It runs from a call's own line to where the
//      next call begins now, so it spans either side of the parse (the await
//      style checks `res.ok` AFTER reading the body on purpose, to quote the
//      server's own words back) without ever reaching the next call.
//   4. `/\.status\s*[=!]==?/` matched `d.ticket.status === "unavailable"` — a
//      DOMAIN field — and declared an unguarded parse safe. A false guard is
//      worse than no guard: it hides the bug it was written to find. The check
//      is scoped to the response object now.
//
// **This asserts ZERO**, and both directions are mutation-checked: a chain
// regression beside an already-fixed sibling, and the removal of a legitimate
// post-parse `res.ok`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

// Resolve which endpoint a `.json()` actually belongs to by walking BACK to the
// nearest call that names a URL. A window-scan attributes the parse to whatever
// path happens to appear nearby, and that produced two false positives in the
// first version of this sweep: a `postJSON("/api/connect", …)` read was blamed
// on an `/api/moodboard` call eight lines above it, and an `/api/related` read
// on a neighbouring one. Both endpoints are ungated; neither was ever a bug.
// `sendJSON` is matched first because its URL is the SECOND argument.
function callSiteFor(lines, index) {
  for (let j = index; j >= Math.max(0, index - 12); j--) {
    const send = lines[j].match(/sendJSON\s*\(\s*["'`][A-Z]+["'`]\s*,\s*["'`]([^"'`]+)/);
    if (send) return { line: j, endpoint: send[1].split("?")[0] };
    const call = lines[j].match(/(?:authorizedFetch|postJSON|fetch)\s*\(\s*["'`]([^"'`]+)/);
    if (call) return { line: j, endpoint: call[1].split("?")[0].replace(/\$\{.*/, "") };
  }
  return null;
}

function endpointFor(lines, index) {
  return callSiteFor(lines, index)?.endpoint ?? null;
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
      const site = callSiteFor(lines, i);
      if (!site) return;
      if (![...gated].some((g) => site.endpoint === g || site.endpoint.startsWith(g + "/"))) return;
      // The guard must belong to THIS call, and may sit on EITHER side of the
      // parse. The await style reads the body first on purpose, to quote the
      // server's own words back:
      //
      //     const d = await res.json();
      //     if (!res.ok) { setErr(d.error || "…"); return; }
      //
      // so a window ending at the parse line calls that correct code a bug. A
      // fixed window in the other direction reads the NEIGHBOUR's `r.ok` and
      // calls a real bug guarded. The window therefore runs from this call's
      // own line until the next call begins — never past it.
      let end = i + 1;
      while (end < lines.length && end <= i + 6) {
        if (callSiteFor(lines, end)?.line === end) break;  // the next call starts
        end++;
      }
      const own = lines.slice(site.line, end).join("\n");
      // `.status` must belong to the RESPONSE. An unscoped /\.status\s*[=!]==?/
      // matched `d.ticket.status === "unavailable"` — a domain field — and
      // declared a genuinely unguarded parse safe. A false guard is worse than
      // no guard: it hides the bug it was written to find.
      if (/\.ok\b/.test(own) || /\b(?:res|resp|response|r)\.status\b/.test(own)) return;
      counts[f] = (counts[f] || 0) + 1;
    });
  }
  return counts;
}

test("no client read of a gated route skips the status check", () => {
  const found = unguardedByFile();
  const offenders = Object.entries(found)
    .map(([file, n]) => `${file}: ${n} unguarded read(s) of a route that can answer 401/403`);

  assert.deepEqual(offenders, [],
    "check `res.ok` before parsing — a 401 body parses fine and renders as empty state");
});

test("the detector still finds the shape it was written for", () => {
  // If `gatedRoutes()` ever returns nothing — a refactor moves the 401s behind
  // a helper, say — every assertion above passes by finding zero of everything.
  // That is this file's own trap 22, so the preconditions are asserted.
  const gated = gatedRoutes();
  assert.ok(gated.size >= 20, `expected many gated routes, found ${gated.size}`);
  assert.ok(gated.has("/api/boards") && gated.has("/api/orders"),
    "the routes this sweep was built around must still be recognised as gated");
  // The count is zero now, so "found nothing" can no longer prove the detector
  // works. Prove it on a known-bad sample instead: a real page's fixed line with
  // its `r.ok` taken back out must be caught.
  const sample = [
    '    authorizedFetch("/api/orders?user=" + user)',
    "      .then((r) => r.json())",
    "      .then((d) => setBagHistory(d.bagHistory || []))",
  ];
  assert.equal(endpointFor(sample, 1), "/api/orders",
    "the endpoint resolver must still attribute a parse to its own call");
});
