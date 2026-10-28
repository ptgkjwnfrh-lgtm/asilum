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
export function shouldPollActivity({
  open = false, threadId = null, folder = null, heardFromThem = true,
} = {}) {
  if (!open || !threadId) return false;
  // NOR A KNOCK NOBODY HAS ANSWERED, from either side. The folder test only
  // ever silenced the RECIPIENT's client: the opener's own copy of a knock
  // sits in their inbox, so they polled every three seconds forever for an
  // answer v46 guarantees is empty. `heardFromThem` is the reader's own
  // thread contents — not a fact about the other person, just whether this
  // conversation has ever had two voices in it.
  if (!heardFromThem) return false;
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

/**
 * Poll inbox summaries only while this tab is visible. The former interval
 * scheduled up to 80 polls per hidden hour before browser throttling.
 * Returning to the tab refreshes immediately, then keeps the same cadence.
 * An already-started request may finish; cleanup prevents future polls.
 */
export function startSummaryPolling(poll, {
  page = document, host = window, intervalMs = 45000,
} = {}) {
  let stopped = false;
  let timer = null;
  const refresh = () => {
    if (!stopped && page.visibilityState === "visible") return poll();
  };
  const onVisibility = () => {
    if (timer !== null) host.clearInterval(timer);
    timer = null;
    if (!stopped && page.visibilityState === "visible") {
      refresh();
      timer = host.setInterval(refresh, intervalMs);
    }
  };
  page.addEventListener("visibilitychange", onVisibility);
  host.addEventListener("asilum:identity", refresh);
  onVisibility();
  return () => {
    stopped = true;
    if (timer !== null) host.clearInterval(timer);
    page.removeEventListener("visibilitychange", onVisibility);
    host.removeEventListener("asilum:identity", refresh);
  };
}

// ---------------------------------------------------------------------------
// STAGE C (V.2 brief §3). Two rules the desk renders by, kept here so a test
// can reach them: WHICH CONTROLS a message row shows, and WHAT THE COUNTER
// says. The server decides again on every act; these only decide what to draw.
// ---------------------------------------------------------------------------
import { DM_TEXT_MAX_GRAPHEMES, EDIT_WINDOW_MS, UNSEND_WINDOW_MS, graphemes, withinWindow } from "./dm.js";

/** { edit, unsend } for one message row as THIS viewer sees it, at `now`. */
export function messageControls(m, now = Date.now()) {
  if (!m || !m.mine || m.unsent || m.redacted) return { edit: false, unsend: false };
  const kind = m.kind || "text";
  return {
    edit: kind === "text" && withinWindow(m.at, EDIT_WINDOW_MS, now),
    unsend: withinWindow(m.at, UNSEND_WINDOW_MS, now),
  };
}

/** The counter near the limit: shown from 100 under, red over, and SEND is refused over. */
export function composerCount(text, limit = DM_TEXT_MAX_GRAPHEMES) {
  const count = graphemes(text);
  return { count, limit, show: count >= limit - 100, over: count > limit };
}

// ---------------------------------------------------------------------------
// THE MESSAGE BANNER (owner, 27 Oct 2026: "if a user gets a direct message
// while on the app they will get a pop up message at the top like a regualr
// ios message and if clicked the keyboard will spawn and they can quickly
// reply. however if double clicked it will take users to the direct message
// tab"). DmLive.jsx draws it; these are its rules.
// ---------------------------------------------------------------------------

/** How often the banner's inbox read runs while the app is on screen: one
 *  page-one read of the inbox and one of requests every 20s is 360 reads an
 *  hour, inside the dm-inbox bucket's 1200 with room for the desk itself. */
export const LIVE_POLL_MS = 20000;
/** How long a banner stays when it is not touched. */
export const BANNER_MS = 6000;
/** A second tap inside this long is a double tap: the DM tab — the Feed's
 *  own double tap (app/page.js), so a double tap feels the same everywhere. */
export const DOUBLE_TAP_MS = 280;

/**
 * What arrived since the last look. `seen` maps a conversation id to the
 * last activity this device has accounted for; the first look only learns
 * (no banner storm for what was already waiting on load). A row is news
 * when it has unread messages, is not muted, and moved since it was seen.
 * Newest first. Requests carry no preview (the store nulls it: a stranger's
 * words are not shown before they are accepted).
 */
export function incomingSince(seen, rows, folder = "inbox") {
  const next = { ...(seen || {}) };
  const incoming = [];
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    const at = Date.parse(r.lastActivityAt || "") || 0;
    const before = seen ? seen[r.id] : undefined;
    next[r.id] = Math.max(at, before || 0);
    if (!seen || r.muted || !(r.unread > 0)) continue;
    if (before !== undefined && at <= before) continue;
    incoming.push({ id: r.id, handle: r.handle || null, preview: folder === "requests" ? null : (r.preview || null), at, request: folder === "requests" });
  }
  incoming.sort((a, b) => b.at - a.at);
  return { seen: next, incoming };
}

/** One tap or the second of two: "double" when the last tap on the same
 *  banner was within DOUBLE_TAP_MS. */
export function tapIntent(lastTapAt, now, within = DOUBLE_TAP_MS) {
  return Number.isFinite(lastTapAt) && now - lastTapAt >= 0 && now - lastTapAt <= within ? "double" : "single";
}

// Which conversation (or person, or folder) the DM tab should show when it
// next looks: set by the banner's double tap or a storefront's MESSAGE key,
// taken once by the desk (on mount, or on the asilum:dm-pending event).
let pending = null;
export function askDesk(what) {
  pending = what && (what.thread || what.handle || what.folder) ? { ...what } : null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("asilum:dm-pending"));
}
export function takeDeskRequest() { const p = pending; pending = null; return p; }

/** THE ROW'S TIME (owner's messages sketch, 28 Oct 2026: "11 DAYS AGO >>"): how long since a conversation's
 *  last activity, in whole units, the way the page prints it. `null` for a time it cannot read. */
export function agoWords(at, now = Date.now()) {
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  const m = Math.floor(s / 60), h = Math.floor(s / 3600), d = Math.floor(s / 86400);
  // days run to two weeks, as the sketch reads ("11 DAYS AGO"); then weeks to five; then months; then years
  const [n, unit] = s < 60 ? [0, null] : m < 60 ? [m, "MINUTE"] : h < 24 ? [h, "HOUR"] : d < 14 ? [d, "DAY"]
    : d < 35 ? [Math.floor(d / 7), "WEEK"] : d < 365 ? [Math.floor(d / 30), "MONTH"] : [Math.floor(d / 365), "YEAR"];
  return unit ? n + " " + unit + (n === 1 ? "" : "S") + " AGO" : "JUST NOW";
}

