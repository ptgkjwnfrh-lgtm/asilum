// tests/canonical-host.test.js — one canonical host, and never a loop.
//
// Ruling 7 (apex vs www) was stalled partly because settling it meant editing
// nine files, and a missed one is an inconsistent canonical — the exact drift
// the ruling is about. lib/site.js is now the only place the origin appears, so
// the ruling is one line. These tests hold that:
//
//   1. nothing outside lib/site.js hardcodes the origin in code;
//   2. flipping SITE_ORIGIN really does move everything, INCLUDING which hosts
//      redirect — proved by importing the module under the apex;
//   3. SITE_HOST never redirects to itself.
//
// (3) is the one that matters most. A `has` host rule that matched a suffix
// rather than an exact string would make www redirect to www forever and take
// the whole site down. It is verified here against the real next.config, and it
// was verified against a real server with Host headers before shipping:
//   apex -> 308 https://www.asilummagazine.com/discover?q=coat  (query kept)
//   www  -> 200                       (no loop — the match is exact)
//   asilum-git-*.vercel.app -> 200    (previews stay reachable)
//   notasilummagazine.com   -> 200    (no suffix matching either)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// fileURLToPath, never url.pathname — this repo's directory name has spaces.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

import { SITE_ORIGIN, SITE_HOST, REDIRECT_HOSTS, siteUrl } from "../lib/site.js";

test("SITE_ORIGIN is an origin — scheme and host, no trailing slash, no path", () => {
  assert.equal(SITE_ORIGIN, "https://www.asilummagazine.com");
  assert.ok(!SITE_ORIGIN.endsWith("/"), "a trailing slash doubles up in every siteUrl()");
  assert.equal(new URL(SITE_ORIGIN).pathname, "/");
  assert.equal(SITE_HOST, "www.asilummagazine.com");
});

test("siteUrl builds one slash, whatever it is handed", () => {
  assert.equal(siteUrl("/"), "https://www.asilummagazine.com/");
  assert.equal(siteUrl("/discover"), "https://www.asilummagazine.com/discover");
  assert.equal(siteUrl("sitemap.xml"), "https://www.asilummagazine.com/sitemap.xml");
  assert.equal(siteUrl(), "https://www.asilummagazine.com/");
  assert.ok(!siteUrl("/x").includes("//x"), "never https://host//path");
});

test("the canonical host is NEVER in the redirect list", () => {
  assert.ok(!REDIRECT_HOSTS.includes(SITE_HOST),
    "a host redirecting to itself is an infinite loop and a site outage");
  // Positive half, so the guard cannot pass by the list being empty: both real
  // duplicate hosts must be covered.
  assert.ok(REDIRECT_HOSTS.includes("asilummagazine.com"), "the apex serves a duplicate copy");
  assert.ok(REDIRECT_HOSTS.includes("asilum.vercel.app"), "so does the production alias");
  assert.ok(!REDIRECT_HOSTS.some((h) => h.startsWith("asilum-git-")),
    "preview deployments must stay reachable for review");
});

// MUST be `async` with an awaited import. Written first as
// `try { return import(...).then(...) } finally { restore }`, which restored the
// env BEFORE the import resolved — the module then read the default and the test
// failed claiming the code was wrong. A `finally` around a returned promise runs
// at the return, not at the settle.
test("flipping SITE_ORIGIN to the apex moves the host AND the redirect list", async () => {
  // The whole claim of lib/site.js: ruling 7 is one line. Proved rather than
  // asserted — a fresh module instance under the apex must swap which host is
  // canonical and which one redirects, with no self-redirect either way.
  const before = process.env.SITE_ORIGIN;
  process.env.SITE_ORIGIN = "https://asilummagazine.com";
  try {
    // A query string gives a distinct module URL, so this is a real re-import
    // rather than the cached one.
    const apex = await import("../lib/site.js?apex");
    assert.equal(apex.SITE_HOST, "asilummagazine.com");
    assert.equal(apex.siteUrl("/cover"), "https://asilummagazine.com/cover");
    assert.ok(!apex.REDIRECT_HOSTS.includes("asilummagazine.com"),
      "the newly canonical host must stop redirecting to itself");
    assert.ok(apex.REDIRECT_HOSTS.includes("www.asilummagazine.com"),
      "www must hand its traffic over once the apex is canonical");
  } finally {
    if (before === undefined) delete process.env.SITE_ORIGIN;
    else process.env.SITE_ORIGIN = before;
  }
});

test("a trailing slash in the override is stripped, not carried", async () => {
  const before = process.env.SITE_ORIGIN;
  process.env.SITE_ORIGIN = "https://staging.example.com///";
  try {
    const mod = await import("../lib/site.js?slashes");
    assert.equal(mod.SITE_ORIGIN, "https://staging.example.com");
    assert.equal(mod.siteUrl("/x"), "https://staging.example.com/x");
  } finally {
    if (before === undefined) delete process.env.SITE_ORIGIN;
    else process.env.SITE_ORIGIN = before;
  }
});

// ------------------------------------------------------- the real next.config

test("every configured redirect is permanent and points at SITE_ORIGIN", async () => {
  // The actual config object, not a regex over its source.
  const { default: config } = await import("../next.config.mjs");
  const rules = await config.redirects();
  assert.ok(rules.length >= 2, "the apex and the vercel.app alias both need a rule");
  for (const rule of rules) {
    assert.equal(rule.source, "/:path*");
    assert.ok(rule.permanent === true, "a canonical-host move is a 308, not a 307");
    assert.ok(rule.destination.startsWith(SITE_ORIGIN),
      `destination must be the canonical origin, got ${rule.destination}`);
    assert.ok(rule.destination.endsWith("/:path*"), "the path must survive the redirect");
    const hosts = (rule.has || []).filter((h) => h.type === "host").map((h) => h.value);
    assert.equal(hosts.length, 1, "one host per rule, so the matching stays exact");
    assert.notEqual(hosts[0], SITE_HOST, "THE LOOP: a rule matching the canonical host");
  }
});

// ------------------------------------------------------- no stray literals

// Comment lines are allowed to name the origin — app/profile/page.js documents
// the exact string the owner must paste into Supabase's allow list, and that
// note is more useful spelled out than referred to.
function codeOnly(src) {
  return src.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(ROOT + dir)) {
    const rel = dir + "/" + entry;
    if (statSync(ROOT + rel).isDirectory()) walk(rel, out);
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(rel);
  }
  return out;
}

test("no file outside lib/site.js hardcodes the origin in code", () => {
  const offenders = [];
  for (const file of [...walk("app"), ...walk("lib"), "next.config.mjs"]) {
    if (file === "/lib/site.js" || file === "lib/site.js") continue;
    const src = codeOnly(read(file.replace(/^\//, "")));
    // Bound to a quoted string literal beginning with the scheme — prose in
    // /terms, /privacy and /accessibility names the bare domain, which is right,
    // and legal@asilummagazine.com is an address, not an origin.
    if (/["'`]https:\/\/(www\.)?asilummagazine\.com/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    "these must import SITE_ORIGIN/siteUrl from lib/site.js instead");
});

test("the surfaces that publish a canonical all resolve through lib/site.js", () => {
  // Positive counterpart: the guard above would also pass if these files simply
  // stopped emitting a URL at all.
  for (const file of ["app/layout.js", "app/sitemap.js", "app/robots.js", "app/piece/[id]/page.js"]) {
    assert.match(read(file), /from "(\.\.\/)+lib\/site\.js"/, `${file} must import the origin`);
  }
  for (const seg of ["hotlist", "discover", "cover", "stylist"]) {
    const src = read(`app/${seg}/layout.js`);
    assert.match(src, /import \{ siteUrl \} from "\.\.\/\.\.\/lib\/site\.js";/);
    assert.match(src, new RegExp(`url: siteUrl\\("/${seg}"\\),`));
  }
});
