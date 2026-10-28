// tests/v2-dm-page.test.js — THE MESSAGES PAGE (owner, 28 Oct 2026, with the
// messages sketch: "we have to build a direct message page that the user will
// be brought to upon clicking the direct message button").
//
// Declared before measuring:
//   - the page is a route of its own, /messages (lib/nav.js MESSAGES_HREF),
//     kept out of search engines; the "messages" popup tab is gone, component
//     and view both;
//   - every door to the desk lands there: the deck's MESSAGES key is a link to
//     it (lit while on it), and openDesk (banner, OFFER, a storefront's
//     MESSAGE) asks the shell to go there unless the reader already is; the
//     shell only follows a same-site path, never "//elsewhere";
//   - on the page the deck's search is in the messages scope, and what is typed
//     there reaches the desk (asilum:dm-find), the listener mounted before the
//     desk's early return so the hook order never changes;
//   - as drawn: ":ECHOS" over the live echo rail (or an honest empty line), then
//     [search] ○ [A] — the A the solid red ASTERISK square, `soon`, since nothing
//     reads mail yet — then a row per conversation: the face, *handle_, the age
//     ("11 DAYS AGO >>"), and ":" before the last words, a hairline under it;
//   - the age reads as the sketch does: days to two weeks, then weeks, months,
//     years; an unreadable time prints nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { agoWords } from "../lib/dm-desk.js";
import { MESSAGES_HREF } from "../lib/nav.js";
import { DECK, scopeFor } from "../lib/dock.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const has = (p) => existsSync(new URL("../" + p, import.meta.url));
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const page = strip(read("app/components/MessagesPage.jsx"));
const desk = strip(read("app/components/MailDesk.jsx"));
const live = strip(read("app/components/DmLive.jsx"));
const shell = read("app/shell.js"); // unstripped: the guard's own "//" is not a comment
const host = strip(read("app/components/SheetHost.jsx"));
const deck = strip(read("app/components/ControlCenter.jsx"));
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

const S = 1000, MIN = 60 * S, H = 60 * MIN, D = 24 * H;
const NOW = Date.parse("2026-10-28T12:00:00Z");

test("the age, as the sketch reads it", () => {
  const ago = (ms) => agoWords(NOW - ms, NOW);
  assert.equal(ago(0), "JUST NOW");
  assert.equal(ago(59 * S), "JUST NOW");
  assert.equal(ago(60 * S), "1 MINUTE AGO");
  assert.equal(ago(59 * MIN), "59 MINUTES AGO");
  assert.equal(ago(H), "1 HOUR AGO");
  assert.equal(ago(23 * H), "23 HOURS AGO");
  assert.equal(ago(D), "1 DAY AGO");
  assert.equal(ago(11 * D), "11 DAYS AGO", "the sketch's own row");
  assert.equal(ago(13 * D), "13 DAYS AGO");
  assert.equal(ago(14 * D), "2 WEEKS AGO");
  assert.equal(ago(34 * D), "4 WEEKS AGO");
  assert.equal(ago(35 * D), "1 MONTH AGO");
  assert.equal(ago(364 * D), "12 MONTHS AGO");
  assert.equal(ago(365 * D), "1 YEAR AGO");
  assert.equal(ago(800 * D), "2 YEARS AGO");
  assert.equal(agoWords(new Date(NOW - 3 * D).toISOString(), NOW), "3 DAYS AGO", "an ISO time reads too");
  assert.equal(ago(-5 * MIN), "JUST NOW", "a clock a little ahead is not the future");
  assert.equal(agoWords("not a time", NOW), null);
  assert.equal(agoWords(undefined, NOW), null);
});

test("a route of its own, and the popup tab gone", () => {
  assert.equal(MESSAGES_HREF, "/messages");
  assert.ok(has("app/messages/page.js"), "the route exists");
  assert.match(read("app/messages/page.js"), /return <MessagesPage \/>;/);
  assert.match(read("app/messages/layout.js"), /robots: \{ index: false, follow: false \}/, "a reader's mail is not indexed");
  assert.ok(!has("app/components/MessagesSheet.jsx"), "the popup tab's component is deleted");
  assert.ok(!/MessagesSheet|messages:\s*\{/.test(host), "and the popup host has no messages view");
  assert.equal(DECK.find((k) => k.id === "messages").kind, "page");
});

test("every door lands on the page", () => {
  assert.match(deck, /href=\{MESSAGES_HREF\}/, "the deck's key is a link");
  assert.match(live, /export function openDesk\(what = null\) \{/);
  const open = live.slice(live.indexOf("export function openDesk"), live.indexOf("const deskOnScreen"));
  assert.match(open, /if \(what\) askDesk\(what\);/, "what to show is handed over first");
  assert.match(open, /if \(!deskOnScreen\(\)\) window\.dispatchEvent\(new CustomEvent\("asilum:go", \{ detail: \{ href: MESSAGES_HREF \} \}\)\);/);
  assert.match(live, /const deskOnScreen = \(\) => typeof window !== "undefined" && window\.location\.pathname\.startsWith\(MESSAGES_HREF\);/);
  assert.match(shell, /window\.addEventListener\("asilum:go", go\);/);
  assert.match(shell, /href\.startsWith\("\/"\) && !href\.startsWith\("\/\/"\)\) router\.push\(href\);/, "a same-site path only");
});

test("the deck's search on the page reaches the desk", () => {
  assert.equal(scopeFor({ pathname: "/messages", sheet: null }).id, "messages");
  assert.equal(scopeFor({ pathname: "/messages/", sheet: null }).id, "messages");
  assert.notEqual(scopeFor({ pathname: "/", sheet: null }).id, "messages");
  const find = desk.indexOf('window.addEventListener("asilum:dm-find", onFind);');
  assert.ok(find > -1, "the desk listens");
  assert.ok(find < desk.indexOf("if (available !== true) return null;"), "before the early return: the hooks never change order");
  assert.match(desk, /showThread\(null\); setSearchQ\(q\);/, "through the one door every thread change takes");
});

test("the page as drawn: ECHOS, the head, the rows", () => {
  assert.match(page, /<h2 className="dmlabel"><i aria-hidden="true">:<\/i>ECHOS<\/h2>/);
  assert.match(page, /\{rail\.length \? <EchoRail groups=\{rail\} \/> : <p className="dmnone">/, "the live echo rail, or an honest empty line");
  assert.match(page, /\{why === "desk" && <MailDesk embedded page \/>\}/);
  const head = desk.slice(desk.indexOf('<div className="dmhead">'), desk.indexOf('<div className="dmfolders"'));
  assert.ok(head.indexOf('className="dmsearch"') < head.indexOf('"dmnew"') && head.indexOf('"dmnew"') < head.indexOf('className="dmast soon"'), "[search] ○ [A], in that order");
  assert.match(head, /<AMark solid label="ASTERISK in your messages — not built yet" \/>/, "the A is the solid square, and says it is not built");
  assert.ok(!/dmast[^>]*onClick/.test(head), "and does nothing it cannot do");
  const rows = desk.slice(desk.indexOf('<ul className="dmlist">'), desk.indexOf("</ul>", desk.indexOf('<ul className="dmlist">')));
  // the row's age and its line come from rowPreview since the offer row (tests/v2-dm-offer-row.test.js)
  assert.match(rows, /const line = rowPreview\(c\);\s*const ago = agoWords\(line\.at\);/);
  assert.match(rows, /<span className="dmface"><Avatar name=\{c\.handle \|\| "\?"\} \/><\/span>/);
  assert.match(rows, /\*\{c\.handle\}<i className="dmcur" aria-hidden="true">_<\/i>/);
  assert.match(rows, /<span className="dmwhen">\{ago \? ago \+ " >>" : ""\}<\/span>/);
  assert.match(rows, /<i aria-hidden="true">:<\/i>\{line\.text\}/, "\":\" before the line the row shows");
  assert.match(rows, /onClick=\{\(\) => showThread\(c\.id\)\}/, "a row opens its thread");
  assert.match(css, /\.dmrow::after \{ content: ""; position: absolute;[^}]*height: 1px;/, "the hairline under each row");
  assert.match(css, /\.dmprev \{ grid-column: 2 \/ span 2; grid-row: 2;/, "the last words keep the second line");
  assert.match(css, /\.dmrow\.unread \.dmprev \{ grid-column: 2; \}/, "and give way to the unread count beside them");
});
