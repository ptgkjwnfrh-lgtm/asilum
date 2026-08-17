// tests/reading-room.test.js — the reading room may never claim an article.
//
// This replaced `STORIES`, which printed nine headlines ASILUM invented under
// the mastheads of real publications — "The Archive Is the New Atelier ·
// VOGUE ↗" — with every link pointing at the publication's front page, because
// no such article existed. The original intent was copyright safety, and
// nothing was copied; but attributing fabricated editorial to a real
// publication is worse than quoting one, and no reader could tell.
//
// These tests pin the shape so the old one cannot come back by accident: a
// `title` field reappearing, or a link that claims a specific article.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { READING_ROOM } from "../lib/social.js";

test("every reading-room row is a publication, a beat, and a front page", () => {
  assert.ok(READING_ROOM.length >= 5, "the reading room is populated");
  for (const row of READING_ROOM) {
    assert.equal(typeof row.pub, "string", "a publication name");
    assert.ok(row.pub.trim().length > 1, `${row.pub}: named`);
    assert.equal(typeof row.beat, "string", `${row.pub}: carries a beat line`);
    assert.ok(row.beat.trim().length > 10, `${row.pub}: the beat line says something`);
  }
});

test("no row carries anything that could read as an article title", () => {
  // The exact regression. `title` was the fabricated field; `summary` described
  // an article that did not exist. Either reappearing recreates the problem.
  for (const row of READING_ROOM) {
    assert.equal("title" in row, false,
      `${row.pub}: a title field is how the fabricated headlines got here`);
    assert.equal("summary" in row, false,
      `${row.pub}: summary described a specific article; the beat describes the masthead`);
    assert.equal("headline" in row, false, `${row.pub}: no headline field either`);
  }
});

test("every link goes to a publication's front page, never a claimed article", () => {
  // A deep link would assert "this publication published this piece". Only a
  // fetched, verified, permitted article may ever do that — and none is.
  for (const row of READING_ROOM) {
    const url = new URL(row.url);
    assert.equal(url.protocol, "https:", `${row.pub}: https only`);
    assert.equal(url.pathname, "/", `${row.pub}: front page only — a path claims an article`);
    assert.equal(url.search, "", `${row.pub}: no query string`);
    assert.equal(url.hash, "", `${row.pub}: no fragment`);
  }
});

test("the rendered surfaces print the beat, and no invented headline", () => {
  // Read as text: both render sites used to interpolate `st.title` beside a
  // real masthead. Bounded matches — the trap this suite already recorded is a
  // regex reaching further than intended.
  for (const file of ["app/hotlist/page.js", "app/cover/page.js"]) {
    const src = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.ok(!/\bSTORIES\b/.test(src.replace(/\/\/.*$/gm, "")),
      `${file}: the old STORIES export is gone from live code`);
    assert.ok(!/\{\s*s?t?\.title\s*\}/.test(src),
      `${file}: nothing renders a story title beside a publication name`);
    assert.match(src, /READING_ROOM/, `${file}: renders the reading room`);
  }
});
