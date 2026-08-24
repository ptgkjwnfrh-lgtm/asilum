// lib/dm-desk.js
// The mail desk's decisions, as functions.
//
// Extracted from app/components/MailDesk.jsx for the same reason lib/nav.js
// was extracted from the shell: there is no DOM harness in this repo — no
// jsdom, no testing-library — so a rule that lives inside the component is a
// rule no test can reach, and the only alternative is a source-text assertion
// that cannot tell a fix from a reworded comment (trap 64).
//
// All three rules here answer the same complaint from the 23 Aug register:
// STATE THAT OUTLIVES ITS CONTEXT. A draft outliving its addressee, a page
// outliving the folder it was asked for, and a page's reactions dying with the
// response that carried them.

/**
 * Which composer a draft belongs to.
 *
 * One shared `draft` string backed BOTH the search-mode "your first message"
 * box and the in-thread composer, and it was cleared only on a confirmed send.
 * Clear the search field and the panel falls back to the inbox with the text
 * still in hand; open any conversation and the composer is pre-filled with a
 * message meant for someone else — one bare Enter from delivering it, since
 * the thread composer sends on Enter with no confirmation.
 *
 * Keying the drafts makes that UNREPRESENTABLE rather than cleared: a thread
 * and the search box are different composers, and so are two threads. There is
 * no ordering of events that can hand one composer another's words.
 */
export function composerKey({ threadId = null, searching = false } = {}) {
  if (threadId) return `c:${threadId}`;
  return searching ? "find" : "";
}

/**
 * May this folder response be applied to what the panel is holding?
 *
 * `loadFolder` had no cancellation token and no check that the folder it was
 * called for was still selected. Press MORE ↓ on a long inbox, switch to
 * REQUESTS while it is in flight, and the inbox page lands second: `more` is
 * truthy and `prev` is the (empty, truthy) requests array, so it takes the
 * append branch and merges accepted inbox threads into REQUESTS — with the
 * preview text the store deliberately nulls for requests. It installs the
 * inbox cursor too, so MORE ↓ under REQUESTS keeps paging the inbox.
 *
 * De-duplicating by conversation id cannot catch it: the ids are all real and
 * all distinct. What is wrong is not the row, it is the folder it came from.
 */
export function pageIsCurrent(response, current) {
  if (!response || !current) return false;
  return response.folder === current.folder && response.token === current.token;
}

/**
 * Merge a page into what is held. Appending de-duplicates by id, because a
 * conversation that gained a message mid-scroll can legally appear on two
 * pages — the snapshot cursor makes that rare, not impossible.
 */
export function mergeFolderItems(prev, next, { append = false } = {}) {
  const incoming = next || [];
  if (!append || !prev) return incoming;
  const seen = new Set(prev.map((x) => x.id));
  return [...prev, ...incoming.filter((x) => !seen.has(x.id))];
}

/**
 * The reactions on one message, looked up across every page in the thread.
 *
 * `loadOlder` kept only `{ messages, olderBefore }` and dropped the page's
 * `reactions`, while rendering looked them up in the newest page's map alone —
 * which the route computes over the newest page's message ids only. So every
 * message paged in from above rendered bare no matter what the database held,
 * the reader tapped the same reaction again, and `loadThread` then reset the
 * older pages and the message left the view entirely.
 *
 * Pages are given newest-first; a message belongs to exactly one of them.
 */
export function reactionsAcross(pages, messageId) {
  const key = String(messageId);
  for (const page of pages || []) {
    const found = page?.reactions?.[key];
    if (found && found.length) return found;
  }
  return [];
}

/**
 * Should the panel be polling the activity endpoint at all?
 *
 * The poll runs every three seconds while a thread is open. It kept running
 * for an UNACCEPTED knock, where the answer is unconditionally
 * `{typing: null, readUpTo: null}` — v46 made presence need an accepted
 * conversation, in the trigger and in the query. So the leak that finding
 * described is gone and what is left is pure waste: 1200 guaranteed-empty
 * reads an hour, which is exactly the caller's own `dm-activity` budget. Spend
 * it on a knock and the indicators in your REAL threads go quiet for the rest
 * of the hour, because a 429 is silently ignored by the tick.
 *
 * A REQUEST IS NOT A CONVERSATION YET, so there is nothing to poll for.
 */
export function shouldPollActivity({ open = false, threadId = null, folder = null } = {}) {
  if (!open || !threadId) return false;
  // `folder` unknown means the thread has not loaded yet — poll, because the
  // common case is an accepted thread and one wasted tick is cheaper than an
  // indicator that never starts.
  return folder !== "requests";
}

/**
 * The panel's own "I have not heard yet" state, used when a thread opens and
 * when a poll fails.
 *
 * Locally this is genuinely UNKNOWN, and null says so. It is deliberately NOT
 * the shape the wire uses: the payload answers two booleans, because a null
 * that only some peers produce is a fact about those peers. This constant
 * never crosses the network and is never compared against another person's
 * data — it exists so a stale claim from one thread cannot be rendered in
 * another.
 */
export const NO_SIGNAL = Object.freeze({ typing: null, readYours: null });
