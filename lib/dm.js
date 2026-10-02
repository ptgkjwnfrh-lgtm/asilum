// lib/dm.js
// Direct messages — the isomorphic half. No database, no server-only imports,
// so the shell and the API agree on the vocabulary.
//
// OWNER-DECISIONS #3: text only. The media pipeline is gated separately and
// does not exist yet; the per-conversation consent STATE does.

// THE TEXT LIMIT (V.2 brief §3): a product default of 1,000 grapheme
// clusters — counted the way a person counts — plus a byte ceiling the
// database also keeps (schema v59: 8 KiB). Neither truncates: the route
// refuses an over-long message with its count, and the composer shows a
// counter near the limit. BODY_MAX stays as the legacy character cap the
// old test named; it is no longer what normalizeBody enforces.
export const BODY_MAX = 2000;
export const DM_TEXT_MAX_GRAPHEMES = 1000;
export const DM_TEXT_MAX_BYTES = 8192;
// the owner's one-hour rules (they override the familiar apps' limits)
export const EDIT_WINDOW_MS = 60 * 60 * 1000;
export const UNSEND_WINDOW_MS = 60 * 60 * 1000;
// the archive policy (brief §3): after six calendar months the display
// image is not auto-loaded; the thumbnail and the metadata stay
export const ARCHIVE_AFTER_MONTHS = 6;
// the owner's exact copy when a passenger has switched sharing off
export const SHARE_REFUSED_COPY = "*this passenger does not want their profile shared\n\n:Connect with them to get to know them more";

export function graphemes(text) {
  const s = String(text || "");
  if (!s) return 0;
  try { if (typeof Intl !== "undefined" && Intl.Segmenter) { let n = 0; for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)) n++; return n; } } catch {}
  return Array.from(s).length;
}
export function utf8Bytes(text) { return new TextEncoder().encode(String(text || "")).length; }

/** Why a body may not be sent, or null. Pure; the route and the composer agree. */
export function bodyRefusal(text) {
  const g = graphemes(text), b = utf8Bytes(text);
  if (g > DM_TEXT_MAX_GRAPHEMES) return { code: "too-long", graphemes: g, limit: DM_TEXT_MAX_GRAPHEMES, message: `a message is at most ${DM_TEXT_MAX_GRAPHEMES} characters — this one is ${g}` };
  if (b > DM_TEXT_MAX_BYTES) return { code: "too-many-bytes", bytes: b, limit: DM_TEXT_MAX_BYTES, message: `a message is at most ${DM_TEXT_MAX_BYTES} bytes — this one is ${b}` };
  return null;
}

/** Is `createdAt` still inside the window at `now`? Pure. */
export function withinWindow(createdAt, windowMs, now = Date.now()) {
  const t = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isFinite(t) && now - t < windowMs;
}

/** Six calendar months on from a date (the archive boundary). Pure. */
export function archiveBoundary(createdAt, months = ARCHIVE_AFTER_MONTHS) {
  const d = new Date(typeof createdAt === "number" ? createdAt : Date.parse(createdAt));
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}
export function isArchived(createdAt, now = Date.now()) {
  const b = archiveBoundary(createdAt);
  return !!b && Date.parse(b) <= now;
}

// THE SEARCH SYNTAX (brief §3), parsed deterministically, never by a model:
//   *handle                → conversations with that passenger
//   words                  → messages across the viewer's conversations
//   *handle: words         → messages with that passenger
//   "quoted words"         → exact phrase
// Typographic apostrophes and quotes are normalised so Jerry's finds Jerry’s.
const CURLY = /[‘’‚‛′]/g, DQUOTE = /[“”„‟″]/g;
export function normalizeSearchText(s) {
  return String(s || "").replace(CURLY, "'").replace(DQUOTE, '"').replace(/\s+/g, " ").trim();
}
export function parseDmSearch(input) {
  const q = normalizeSearchText(input);
  // a bare star, or a star and a colon, names nobody and asks nothing
  if (!q || /^\*\s*:?\s*$/.test(q)) return { handle: null, text: "", exact: false, empty: true };
  let handle = null, rest = q;
  const m = /^\*([a-z0-9_.-]{1,40})\s*(?::\s*(.*))?$/i.exec(q);
  if (m) { handle = m[1].toLowerCase(); rest = (m[2] || "").trim(); }
  let exact = false, text = rest;
  const quoted = /^"([^"]+)"$/.exec(rest);
  if (quoted) { exact = true; text = quoted[1].trim(); }
  return { handle, text, exact, empty: !handle && !text };
}
// THE CLEAR NOTICE (brief §3): the other participant is told once per clear,
// neutrally — the owner's requested behaviour, and a deliberate departure from
// the familiar apps. The brief's own recommendation for founder review is to
// suppress it (clearing one's inbox is ordinarily private); until that is
// approved the notice is ON, and this one switch is where it would turn off.
export function clearNoticesEnabled() {
  return process.env.DM_CLEAR_NOTICES !== "0";
}
// a profile card's excerpt of the shared passenger's statement
export const PROFILE_CARD_STATEMENT_MAX = 160;

export const FOLDERS = ["inbox", "requests", "archived"];
export const CONVERSATION_STATES = ["requested", "accepted", "declined"];

/** Feature F. Absent by default — FEATURE-FLAGS.md: "feature absent". */
export function messagingEnabled() {
  return process.env.MESSAGING_ENABLED === "1";
}

/**
 * Attachments. A SECOND flag, deliberately, and it stays off: OWNER-DECISIONS
 * #3 blocks media on a CSAM provider, a designated DMCA agent, named moderator
 * credentials and a response target. There is also no video handling anywhere
 * in the codebase. The consent toggle is still built and still recorded — the
 * pipeline it guards is what is missing.
 */
export function dmMediaEnabled() {
  return process.env.DM_MEDIA_ENABLED === "1" && messagingEnabled();
}

// Control characters except tab and newline. Same posture as the house
// sanitizer in lib/profile/rooms.js: strip, never render. Written as escapes
// rather than literal bytes so the source stays greppable.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trim a message body. Returns "" when there is nothing to send. It no
 *  longer cuts at BODY_MAX (1 Oct): a message over the limit is REFUSED
 *  with its count (bodyRefusal), never shortened behind the sender's back. */
export function normalizeBody(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(CONTROL_CHARS, "")
    .trim();
}

/**
 * Which folder a NEW conversation lands in, for each side.
 *
 * The owner's ruling (23 Aug): first contact from a stranger goes to REQUESTS,
 * not the inbox. Per-side, because the sender chose to send it — their own
 * copy belongs in their inbox. `knownToRecipient` is true when the recipient
 * already follows the sender or has messaged them before; a thread you asked
 * for should not arrive as a request.
 */
export function foldersForNewConversation({ knownToRecipient = false } = {}) {
  return { sender: "inbox", recipient: knownToRecipient ? "inbox" : "requests" };
}

/**
 * How a refusal is described to the person who hit it.
 *
 * Refusals about SOMEONE ELSE are deliberately vague — "not reachable" — so
 * the endpoint cannot be used to discover that a particular person blocked
 * you, or that they exist at all.
 *
 * A refusal caused by the CALLER'S OWN block is NOT vague. The red team found
 * the ambiguous rule applied to your own block, which tells you a business
 * that legally cannot close its DMs is "not reachable" — withholding
 * information from the only person entitled to it, with no way to discover
 * their own decline. Yours is always explained, and always with the undo.
 */
export function describeRefusal(code, { callerBlockedThem = false, knockPending = false } = {}) {
  if (callerBlockedThem) {
    return { reason: "you-blocked-them", message: "you blocked this person. unblock to send." };
  }
  // AN IGNORED KNOCK AND A DECLINED ONE READ ALIKE.
  //
  // The payload stopped naming `dm_conversations.state`, and then the WORDING
  // named it anyway. dm_guard_message checks LAW 1 before LAW 3, and a decline
  // installs a block — so an opener who sends a second message gets:
  //
  //   "one message until they reply."       -> still pending. they ignored it.
  //   "this person is not reachable..."     -> declined, blocked, or shut out.
  //
  // One extra send, and the opener knows the recipient ACTED. That is a fact
  // about the recipient's choice, which is the whole class P0001 and P0002 are
  // collapsed to hide, arriving through the sentence instead of the field.
  //
  // For an opener whose knock was never accepted, the one-knock wording is
  // true in EVERY one of those cases: they have not replied, and no further
  // message will go. So it is what they are told, and the recipient's decision
  // stays theirs. An ACCEPTED conversation is different and stays different —
  // messages used to arrive there, so their stopping is not concealable and
  // pretending otherwise would be the lie this avoids.
  if (knockPending && (code === "P0001" || code === "P0002")) {
    return { reason: "awaiting-reply", message: "one message until they reply." };
  }
  switch (code) {
    case "P0003":
      return { reason: "awaiting-reply", message: "one message until they reply." };
    case "P0004":
      return { reason: "business-always-open", message: "a business cannot switch messages off." };
    // NOBODY IS UNREACHABLE HERE. P0005 is raised on a message that has been
    // unsent or redacted — a fact about the MESSAGE, not about the person —
    // and it fell through to "this person is not reachable right now.", which
    // told a reader their correspondent had become unreachable because a
    // message they could still see on screen had been withdrawn a moment ago.
    // The vagueness above exists to protect somebody's privacy; spending it
    // here bought nothing and said something false.
    case "P0005":
      return { reason: "message-gone", message: "that message is gone." };
    // 42501 reaches this from the reaction path when the mark is not in the
    // palette — the law table refuses it.
    //
    // IT USED TO REACH IT A SECOND WAY, and the comment here said that way
    // "no surface can produce". It could: op="react" takes a message id
    // straight from the client, dm_messages.id is a guessable BIGSERIAL, and
    // the trigger's 42501 for "not in that conversation" was therefore a
    // sentence meaning "this id names a real message in somebody else's
    // thread". The store now resolves the message through the caller's own
    // participation first and answers P0005 either way, so the only 42501 left
    // is about the MARK, which is what this sentence says.
    case "42501":
      return { reason: "mark-unavailable", message: "that mark is not available." };
    // STAGE C (V.2 brief §3–§4). Each of these is a fact about the caller's
    // OWN message or act, so naming it withholds nothing from anyone else.
    case "P0006":
      return { reason: "message-gone", message: "that message can no longer be changed." };
    case "P0007":
      return { reason: "window-closed", message: "an hour has passed. this message can no longer be changed." };
    case "P0008":
      return { reason: "edit-conflict", message: "this message changed under you. reload and try again." };
    case "DM_TOO_LONG":
      return { reason: "too-long", message: "that message is too long." };
    case "DM_SHARE_REFUSED":
      return { reason: "share-refused", message: SHARE_REFUSED_COPY };
    case "DM_NO_SUCH_PASSENGER":
      return { reason: "no-such-passenger", message: "no passenger by that handle." };
    case "DM_SCHEMA":
      return { reason: "not-available-yet", message: "this is not available on the desk yet." };
    case "DM_MEDIA_OFF":
      return { reason: "media-off", message: "images cannot be sent on this deployment." };
    case "DM_NO_CONSENT":
      return { reason: "no-consent", message: "they have not switched images on for this conversation." };
    // P0001 (blocked, theirs) and P0002 (their DMs are closed) collapse on
    // purpose: distinguishing them tells a stranger which one it was.
    default:
      return { reason: "not-reachable", message: "this person is not reachable right now." };
  }
}

/**
 * The inbox cursor. Composite on purpose: `last_activity_at` alone has no
 * tiebreaker, so any two rows sharing a timestamp make `<` skip one and `<=`
 * loop forever. `snapshot` is the page-1 request time — rows that become
 * active AFTER the scroll began are excluded from it and surface at the top on
 * refresh instead, rather than jumping above the cursor and being skipped
 * while the badge still counts them.
 */
export function encodeCursor({ activityAt, conversationId, snapshot }) {
  if (!activityAt || !conversationId || !snapshot) return "";
  return [new Date(activityAt).toISOString(), conversationId,
          new Date(snapshot).toISOString()].join("~");
}

/**
 * Parse an inbox pagination cursor back to its three parts, or null.
 *
 * Null on ANYTHING malformed — a cursor arrives from the client, and a
 * half-parsed one would page from a position nobody chose. The caller starts
 * from the top rather than trusting a repair.
 *
 * The `snapshot` component is what keeps a scroll stable: conversations that
 * become active after paging began are excluded from the page and surface at
 * the top on refresh, instead of jumping above the cursor and being skipped
 * while the badge still counts them.
 */
export function decodeCursor(cursor) {
  const parts = String(cursor || "").split("~");
  if (parts.length !== 3) return null;
  const [activityAt, conversationId, snapshot] = parts;
  if (Number.isNaN(Date.parse(activityAt)) || Number.isNaN(Date.parse(snapshot))) return null;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  return { activityAt, conversationId, snapshot };
}

/**
 * WHICH BUCKET AN OP DRAWS FROM.
 *
 * A table rather than a conditional in the route, because the rule it encodes
 * is a safety rule and deserves a test: THE CONTROLS A PERSON REACHES FOR WHEN
 * THEY NEED THEM MUST NOT SHARE A BUDGET WITH THE CHATTER.
 *
 * Everything except `send` used to share one 240/hour bucket, and the two
 * highest-frequency writes in the product were in it — `typing` fires up to
 * once per 2.5 seconds while composing (1440/hour from a single composer) and
 * `read` fires on every thread open — alongside `block`, `decline`, `unblock`
 * and `mute`. The route's own comment claimed "a burst of reads cannot exhaust
 * the ability to block"; the traffic that could exhaust it was writes in that
 * very bucket.
 *
 * Throttling presence into failure only makes an indicator lie. Throttling a
 * BLOCK is a safety failure. They do not belong together.
 */
export function rateBucketFor(op) {
  const name = String(op || "");
  if (name === "send" || name === "share-profile") return { scope: "dm-send", limit: 120 };
  // an edit is a second send of the same words — bounded like the chatter,
  // never like the controls
  if (name === "edit") return { scope: "dm-send", limit: 120 };
  if (name === "typing" || name === "read") return { scope: "dm-presence", limit: 2400 };
  return { scope: "dm-act", limit: 240 };
}

/**
 * The READ side of the same table.
 *
 * Four of the six GET ops had no per-subject quota at all — `summary`, which
 * every signed-in reader polls on a 45-second timer; `inbox`, a keyset page
 * carrying a correlated unread count AND a correlated preview subquery per
 * row; `thread`, a member probe plus a 101-row read plus a reactions aggregate
 * plus the palette; and `blocks`. Only `find` and `activity` were bounded, and
 * those two were bounded because someone reasoned about enumeration and about
 * polling — not because anyone had drawn the line at "every op".
 *
 * `activity` keeps its own generous bucket for the reason its comment gives:
 * throttling it into failure makes the indicator lie rather than go quiet.
 * `find` keeps its tight one, because searching is cheap for us and valuable
 * to an enumerator.
 */
export function readBucketFor(op) {
  const name = String(op || "");
  if (name === "find") return { scope: "dm-find", limit: 60 };
  // a search walks every conversation the viewer has: its own allowance
  if (name === "search") return { scope: "dm-search", limit: 120 };
  if (name === "activity") return { scope: "dm-activity", limit: 1200 };
  return { scope: "dm-inbox", limit: 1200 };
}
