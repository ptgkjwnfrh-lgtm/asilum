// tests/v2-dm-live.test.js — THE DM TAB AND THE MESSAGE BANNER (owner, 27 Oct
// 2026: "the direct message button should up the direct message tab, if a
// user gets a direct message while on the app they will get a pop up message
// at the top like a regualr ios message and if clicked the keyboard will spawn
// and they can quickly reply. however if double clicked it will take users to
// the direct message tab").
//
// Declared before measuring:
//   - the MESSAGES key opens the DM tab (the "messages" popup tab) and wears
//     how many conversations wait; the deck no longer carries the desk's own
//     panel or a fallback key;
//   - the DM tab IS the live mail desk (embedded: no button, no dialog chrome
//     of its own), or the honest reason it cannot be there; it checks with an
//     op the route has (summary), never one it lacks;
//   - news is a conversation that moved, is unread and is not muted; the first
//     look only learns; a request carries no words;
//   - one tap opens the reply field AND focuses it inside the tap (a phone
//     raises its keyboard only then), so the field is always mounted; a second
//     tap within DOUBLE_TAP_MS opens the DM tab on that conversation; a request
//     opens REQUESTS on any tap and offers no reply;
//   - a reply goes through the DM API's own send with an operation id, then
//     marks the conversation read up to it;
//   - nothing is simulated: the banner only ever comes from /api/dm reads,
//     never over the desk, and its polling fits the read budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../lib/dm-desk.js";
import { readBucketFor } from "../lib/dm.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const live = strip(read("app/components/DmLive.jsx"));
const deck = strip(read("app/components/ControlCenter.jsx"));
const sheet = strip(read("app/components/MessagesSheet.jsx"));
const desk = strip(read("app/components/MailDesk.jsx"));
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("what is news: moved, unread, not muted; the first look only learns; a request has no words; newest first", () => {
  const row = (id, at, extra = {}) => ({ id, unread: 1, muted: false, lastActivityAt: at, preview: "words " + id, handle: "h" + id, ...extra });
  let r = M.incomingSince(null, [row("a", "2026-10-27T10:00:00Z")]);
  assert.deepEqual(r.incoming, [], "the first look only learns");
  r = M.incomingSince(r.seen, [row("a", "2026-10-27T10:05:00Z"), row("b", "2026-10-27T10:06:00Z"), row("c", "2026-10-27T10:07:00Z", { muted: true }), row("d", "2026-10-27T10:08:00Z", { unread: 0 })]);
  assert.deepEqual(r.incoming.map((x) => x.id), ["b", "a"], "newest first; muted and read rows are not news");
  const again = M.incomingSince(r.seen, [row("a", "2026-10-27T10:05:00Z")]);
  assert.deepEqual(again.incoming, [], "the same activity is not news twice");
  const req = M.incomingSince({}, [row("q", "2026-10-27T11:00:00Z", { preview: "a stranger's words" })], "requests");
  assert.equal(req.incoming[0].preview, null, "a request shows no words");
  assert.equal(req.incoming[0].request, true);
});

test("one tap or two; the desk's ask is taken once", () => {
  assert.equal(M.tapIntent(1000, 1000 + M.DOUBLE_TAP_MS), "double");
  assert.equal(M.tapIntent(1000, 1001 + M.DOUBLE_TAP_MS), "single");
  assert.equal(M.tapIntent(-Infinity, 5), "single");
  M.askDesk({ thread: "c1" });
  assert.deepEqual(M.takeDeskRequest(), { thread: "c1" });
  assert.equal(M.takeDeskRequest(), null, "taken once");
  M.askDesk({});
  assert.equal(M.takeDeskRequest(), null, "an empty ask is no ask");
});

test("the banner's reads fit the inbox budget with room for the desk", () => {
  const perHour = 2 * (3600000 / M.LIVE_POLL_MS); // page one of the inbox and of requests
  assert.ok(perHour <= readBucketFor("inbox").limit / 3, `${perHour} reads an hour against ${readBucketFor("inbox").limit}`);
  assert.equal(M.BANNER_MS, 6000);
});

test("the MESSAGES key opens the DM tab and wears the count; the deck carries no desk panel", () => {
  assert.match(deck, /if \(id === "messages"\) \{ openSheet\("messages"\); return; \}/);
  assert.match(deck, /className=\{"tabl hkey ccdm" \+ \(cur \? " cur" : ""\)\} onClick=\{\(\) => press\("messages"\)\}/);
  assert.match(deck, /\{dm\.waiting \? <b className="dmcount" aria-hidden="true">/);
  assert.match(deck, /const dm = useDmLive\(\);/);
  assert.ok(!/MailDesk|ccfallback|cckey-mail/.test(deck), "no panel of the desk's own, no fallback key");
  assert.ok(!/\.ccenter \.(mailpanel|maildesk|cckey-mail)|ccfallback/.test(css), "and none of their styles");
});

test("the DM tab is the live desk, or the honest reason it cannot be", () => {
  assert.match(sheet, /\/api\/dm\?op=summary/, "it asks with an op the route has");
  assert.ok(!/op=counts/.test(sheet), "never the op it lacks (it hung on 'opening…')");
  assert.match(sheet, /\{why === "desk" && <MailDesk embedded \/>\}/);
  for (const w of ["signed-out", "off", "away"]) assert.match(sheet, new RegExp(`why === "${w}"`));
  assert.match(desk, /export default function MailDesk\(\{ glyph = null, keyClass = "", embedded = false \}\)/);
  assert.match(desk, /\{embedded \? null : \(\n\s*<button/, "embedded: no button of its own");
  assert.match(desk, /role=\{embedded \? "region" : "dialog"\}/, "the popup is the dialog");
  assert.match(desk, /useFocusTrap\(panelRef, open && !embedded\);/);
  assert.match(desk, /const ask = takeDeskRequest\(\);/, "it takes what it is asked to show");
  assert.match(desk, /window\.addEventListener\("asilum:dm-pending", take\);/);
  assert.match(css, /\.mailpanel\.embedded \{ position: static;/);
});

test("the banner: from the DM reads only, never over the desk; one tap focuses the reply inside the tap; two open the tab", () => {
  assert.match(live, /\/api\/dm\?op=inbox&folder=\$\{folder\}/, "news comes from the inbox reads");
  assert.ok(!/setBanner\(\{/.test(live), "never a banner made up in the component");
  assert.match(live, /if \(news && !deskOnScreen\(\) && modeRef\.current === "peek"\)/, "never over the desk or a reply in progress");
  const tap = live.slice(live.indexOf("function tap()"), live.indexOf("async function reply"));
  assert.match(tap, /if \(intent === "double" \|\| banner\.request\) \{/);
  assert.match(tap, /openDesk\(what\);/);
  assert.ok(tap.indexOf("fieldRef.current.focus(") > -1 && tap.indexOf("fieldRef.current.focus(") < tap.indexOf('setMode("reply")'), "the focus happens in the tap itself, before any re-render");
  assert.match(live, /\{banner\.request \? null : \(\n\s*<form className="dmbreply"/, "the field is mounted whenever a reply is possible, folded until the tap");
  assert.match(css, /\.dmbreply \{[^}]*max-height: 0; opacity: 0;/, "folded, not display: none (a hidden field cannot take a focus)");
  assert.match(live, /op: "send", user: getUid\(\), conversationId: banner\.id, body: text, clientOperationId: opId/, "the API's own send, idempotent");
  assert.match(live, /op: "read", user: getUid\(\), conversationId: banner\.id, upTo: data\.id/, "then read up to the reply");
  assert.match(live, /const tooLong = bodyRefusal\(text\);/, "refused with its count, never cut");
  assert.match(read("app/shell.js"), /<DmLive \/>/, "mounted in the shell");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.dmbanner \{ animation: none; \}/);
});
