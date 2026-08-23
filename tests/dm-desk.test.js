// tests/dm-desk.test.js — the mail desk's decisions, tested without a DOM.
//
// There is no jsdom in this repo, so these rules were untestable while they
// lived inside MailDesk.jsx. Each one below is a finding from
// docs/dm-open-findings-2026-08-23.md, written from its Reproduce section.

import test from "node:test";
import assert from "node:assert/strict";

import {
  composerKey, mergeFolderItems, pageIsCurrent, reactionsAcross,
} from "../lib/dm-desk.js";

test("a draft cannot reach a composer it was not written for", () => {
  // The register's scenario: type "the invoice is wrong, can you refund the
  // 240" into the search-mode first-message box for @stu, clear the search,
  // then open an existing conversation. One shared string handed that text to
  // the thread composer, which sends on a bare Enter.
  const forStu = composerKey({ searching: true });
  const inThread = composerKey({ threadId: "c0ffee00-0000-4000-8000-000000000000" });
  const otherThread = composerKey({ threadId: "deadbeef-0000-4000-8000-000000000000" });

  assert.notEqual(forStu, inThread, "the search box and a thread are different composers");
  assert.notEqual(inThread, otherThread, "and so are two threads");

  // the drafts a panel holds, keyed
  const drafts = { [forStu]: "the invoice is wrong, can you refund the 240" };
  assert.equal(drafts[inThread] || "", "",
    "opening a conversation finds ITS composer, which is empty");
  assert.equal(drafts[otherThread] || "", "", "and so does the next one");
  assert.equal(drafts[forStu], "the invoice is wrong, can you refund the 240",
    "while the message you actually wrote is still where you wrote it");

  // no thread and not searching is no composer at all
  assert.equal(composerKey(), "");
  assert.equal(composerKey({}), "");
});

test("a folder page cannot land in a folder it was not asked for", () => {
  // MORE ↓ on the inbox, then switch to REQUESTS while it is in flight. The
  // inbox page lands second and used to be APPENDED to the requests list —
  // accepted threads under "first messages from people you have not spoken
  // to", carrying the preview text the store nulls for requests, and
  // installing the inbox cursor so MORE ↓ kept paging the inbox.
  const inFlight = { folder: "inbox", token: 7 };
  const nowSelected = { folder: "requests", token: 8 };

  assert.equal(pageIsCurrent(inFlight, nowSelected), false, "a different folder AND an older request");
  assert.equal(pageIsCurrent({ folder: "requests", token: 7 }, nowSelected), false,
    "the same folder, but a request the panel has already superseded");
  assert.equal(pageIsCurrent({ folder: "inbox", token: 8 }, nowSelected), false,
    "the current request, but for the folder that is no longer selected");
  assert.equal(pageIsCurrent(nowSelected, nowSelected), true, "only the current one applies");

  // de-duplication by id could never have caught it: the ids are all real
  const requests = [{ id: "r1" }];
  const inboxPage = [{ id: "i1" }, { id: "i2" }];
  assert.deepEqual(mergeFolderItems(requests, inboxPage, { append: true }).map((x) => x.id),
    ["r1", "i1", "i2"],
    "which is exactly what it used to do — the row is fine, the FOLDER is wrong");
});

test("a page that is current is merged, and merged once", () => {
  const page1 = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(mergeFolderItems(null, page1).map((x) => x.id), ["a", "b"], "page one replaces");
  assert.deepEqual(mergeFolderItems(page1, [{ id: "c" }], { append: true }).map((x) => x.id),
    ["a", "b", "c"]);
  // a conversation that gained a message mid-scroll can legally appear twice
  assert.deepEqual(mergeFolderItems(page1, [{ id: "b" }, { id: "c" }], { append: true }).map((x) => x.id),
    ["a", "b", "c"], "de-duplicated by id, and the first position is kept");
  assert.deepEqual(mergeFolderItems(page1, null, { append: true }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(mergeFolderItems(page1, [{ id: "c" }]).map((x) => x.id), ["c"],
    "a page-one response REPLACES — that is what makes a folder switch clean");
});

test("a reaction on an older page is still a reaction", () => {
  // Someone reacted to a message forty-one back. loadOlder kept only
  // { messages, olderBefore } and threw the page's reactions away, so the
  // message rendered bare, the reader tapped the same reaction again, and
  // loadThread reset the older pages so the message left the view entirely.
  const newest = { messages: [{ id: 90 }], reactions: { 90: [{ emoji: "\u{1F44D}", count: 1, mine: false }] } };
  const older = { messages: [{ id: 49 }], reactions: { 49: [{ emoji: "❤️", count: 2, mine: true }] } };
  const pages = [newest, older];

  assert.deepEqual(reactionsAcross(pages, 90).map((r) => r.emoji), ["\u{1F44D}"]);
  assert.deepEqual(reactionsAcross(pages, 49).map((r) => r.emoji), ["❤️"],
    "the older page's own reactions, not the newest page's map");
  assert.deepEqual(reactionsAcross(pages, 12), [], "a message nobody reacted to");
  assert.deepEqual(reactionsAcross([{ messages: [] }], 1), [], "a page that carried none at all");
  assert.deepEqual(reactionsAcross(null, 1), []);
});
