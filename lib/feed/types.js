// lib/feed/types.js — THE ONE FEED's card law (V.2 Blueprint, owner, 17 Oct
// 2026, Foundations: "one surface for discovery, publishing and commerce.
// There is no Wire"; "Screen map — FEED"; "Tetris packing"). Pure and
// isomorphic: the feed page and the tests read it, the server never needs
// it.
//
// THE TYPES. Every card in the Feed is one of eight: the six publishing
// types TRANSM · STILL · MOTION · BRDCST · LISTING · ECHO and the two
// discovery cards PLACE and SONG. A wire post derives its type from what
// it carries (lib/posts/compose.js kinds: transmission / post / video, the
// event attachment, the echo mark); a catalog piece is a LISTING; a row of
// the places record is a PLACE. SONG waits for a music catalog (owner
// decision, music APIs) and is never invented.
//
// TETRIS PACKING. The blueprint gave visual weight targets (MOTION and
// STILL about 70%, media plus BRDCST 75%, LISTING 45%, PLACE and SONG 20%,
// standalone BRDCST 10%). Since the owner's feed sketch of 25 Oct 2026 the
// packing is lib/feed/tetris.js — one grid, each kind a few sizes, placed
// like Tetris with even gaps — and the mix is the constitution's (A6, 26
// Oct); the weight table nothing read left on 30 Oct 2026.
//
// ECHO. A story-style temporary post: 24 hours by default (blueprint 1709:
// "24 hours is the provisional default"), never shown live after expiry
// (Terms 5.4).

export const TYPES = Object.freeze(["TRANSM", "STILL", "MOTION", "BRDCST", "LISTING", "ECHO", "PLACE", "SONG"]);

export const ECHO_TTL_MS = 24 * 60 * 60 * 1000;

/** The post's type from what it carries. */
export function postType(post) {
  if (!post || typeof post !== "object") return "TRANSM";
  const a = post.attachments && typeof post.attachments === "object" ? post.attachments : {};
  if (a.echo) return "ECHO";
  if (post.postKind === "video" || a.video || (post.sample && post.video)) return "MOTION";
  const media = Array.isArray(a.media) ? a.media.length : 0;
  const hasImage = media > 0 || !!post.imageUrl || !!post.image;
  if (a.event && !hasImage) return "BRDCST";
  if (hasImage) return "STILL";
  return "TRANSM";
}

/** Whether an ECHO is still live at `now`. A post without the echo mark
 *  is not an echo and this answers false. */
export function echoLive(post, now = Date.now()) {
  const e = post && post.attachments && post.attachments.echo;
  if (!e) return false;
  const until = Number(e.expiresAt);
  return Number.isFinite(until) && until > now;
}

/** The ECHO rail: live echoes grouped by author, most recent first within
 *  an author, authors ordered by their latest echo. */
export function echoRail(posts, now = Date.now()) {
  const by = new Map();
  for (const p of posts || []) {
    if (!echoLive(p, now)) continue;
    const key = p.handle || p.name || "?";
    if (!by.has(key)) by.set(key, { handle: key, name: p.name || key, echoes: [] });
    by.get(key).echoes.push(p);
  }
  const groups = [...by.values()];
  for (const g of groups) g.echoes.sort((a, b) => (b.at || 0) - (a.at || 0));
  groups.sort((a, b) => (b.echoes[0].at || 0) - (a.echoes[0].at || 0));
  return groups;
}

/** Braid posts into the pieces.
 *
 *  A SMART MIX (owner, 26 Oct 2026: "when I'm swiping I don't want two full
 *  scrolls to be comprised of just listings, locations, BRDCSTs and/or songs,
 *  or motions and stills — I want a smart mix"; made a hard rule 28 Oct, with
 *  the four sizes, lib/feed/tetris.js SIZE). Each media post (a still, a
 *  carousel, a motion) — a LARGE card — brings ONE BLOCK of smaller cards
 *  with it that closes level on a phone, so the post and its block alternate
 *  down the screen. Each block is a tile's worth (tetris.js TILE: what closes
 *  a large card's place), turning through FILLER_TURN:
 *    "pieces"  four pieces, two by two;
 *    "mixed"   two pieces stacked beside three smalls;
 *    "other"   four pieces, then a BRDCST strip or a words-only post;
 *    "smalls"  six smalls, two by three.
 *  A block short of smalls is made of pieces; out of pieces, of smalls. The
 *  pieces shown are as many as the posts can carry, in the brain's order. A
 *  BRDCST or a words-only post left over goes at the end. The packer keeps
 *  the mix whatever the order (tetris.js MIX_ROWS).
 *
 *  With no media post at all, the old braid stands: a post after every
 *  third piece, the places after every ninth piece in a pair (19 Oct 2026),
 *  a song between them (SONG_EVERY), so the feed is never empty. Echoes are
 *  not braided: they live on the rail. */
export const PLACE_PAIR = 2;
export const FILLER_TURN = Object.freeze(["pieces", "mixed", "pieces", "other", "pieces", "smalls"]);
const isMedia = (p) => { const t = postType(p); return t === "STILL" || t === "MOTION"; };
export function braid(pieces, posts, places = [], songs = []) {
  const out = [];
  const livePosts = (posts || []).filter((p) => postType(p) !== "ECHO");
  const mediaPosts = livePosts.filter(isMedia);
  const otherPosts = livePosts.filter((p) => !isMedia(p));
  const post = (x) => out.push({ id: "post:" + (x.serverId ?? x.id), __post: x });
  const list = pieces || [];
  if (!mediaPosts.length) return plainBraid(list, livePosts, places, songs);
  // the smalls, places and songs turn about (a place, a song, a place …)
  const smalls = [];
  for (let i = 0; i < Math.max(places.length, songs.length); i++) {
    if (places[i]) smalls.push({ id: "place:" + places[i].id, __place: places[i] });
    if (songs[i]) smalls.push({ id: "song:" + songs[i].id, __song: songs[i] });
  }
  let pi = 0, si = 0, oi = 0;
  const piecesLeft = () => list.length - pi, smallsLeft = () => smalls.length - si;
  const pieceN = (n) => { for (let k = 0; k < n; k++) out.push(list[pi++]); };
  const smallN = (n) => { for (let k = 0; k < n; k++) out.push(smalls[si++]); };
  // a tile's worth: four pieces, else two pieces and three smalls, else six smalls, else whatever is left
  const tile = () => {
    if (piecesLeft() >= 4) pieceN(4);
    else if (piecesLeft() >= 2 && smallsLeft() >= 3) { pieceN(2); smallN(3); }
    else if (smallsLeft() >= 6) smallN(6);
    else { pieceN(piecesLeft()); smallN(smallsLeft()); }
  };
  mediaPosts.forEach((m, u) => {
    post(m);
    const turn = FILLER_TURN[u % FILLER_TURN.length];
    if (turn === "mixed" && piecesLeft() >= 2 && smallsLeft() >= 3) { pieceN(1); smallN(2); pieceN(1); smallN(1); }
    else if (turn === "smalls" && smallsLeft() >= 6) smallN(6);
    else { tile(); if (turn === "other" && oi < otherPosts.length) post(otherPosts[oi++]); }
  });
  while (oi < otherPosts.length) post(otherPosts[oi++]);
  return out;
}

/** The braid with no media post: a post after every third piece, the places
 *  after every ninth piece in a pair, a song between them. */
function plainBraid(pieces, livePosts, places, songs) {
  const out = [];
  let pi = 0, qi = 0, si = 0;
  pieces.forEach((it, i) => {
    out.push(it);
    if ((i + 1) % 3 === 0 && livePosts[pi]) { const x = livePosts[pi++]; out.push({ id: "post:" + (x.serverId ?? x.id), __post: x }); }
    if ((i + 1) % 9 === 0) {
      for (let k = 0; k < PLACE_PAIR && places[qi]; k++) { const pl = places[qi++]; out.push({ id: "place:" + pl.id, __place: pl }); }
    }
    // a song between the place pairs (SONG_EVERY): the model's labelled records (lib/model/songs.js)
    if ((i + 1) % SONG_EVERY === 0 && (i + 1) % 9 !== 0 && songs[si]) { const sg = songs[si++]; out.push({ id: "song:" + sg.id, __song: sg }); }
  });
  if (pieces.length < 3) {
    for (const x of livePosts.slice(pi, pi + 2)) out.push({ id: "post:" + (x.serverId ?? x.id), __post: x });
    for (const pl of places.slice(qi, qi + 1)) out.push({ id: "place:" + pl.id, __place: pl });
  }
  return out;
}
export const SONG_EVERY = 6;

// ---- the owner's 18 Oct references (slice 14) -----------------------------
// docs/v2/references/2026-10-18-feed/2.jpg–5.jpg are the Feed's layout rules:
// the BRDCST footer reads "BRDCST · OCTOBER 31st 10:30 pm · rule · *event ·
// chevron"; the piece popup reads "unverified / ♡ OFFER bag / brand: title /
// SIZE / 35.00 USD". These are the pure readings the components print.

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const ordinal = (d) => d + (d % 100 >= 11 && d % 100 <= 13 ? "th" : d % 10 === 1 ? "st" : d % 10 === 2 ? "nd" : d % 10 === 3 ? "rd" : "th");

/** One moment as the footer prints it: "OCTOBER 31st", with "10:30 pm" when
 *  the record carries a time. A date-only string ("2026-10-31") is read by
 *  its parts, never through the clock, so it does not drift a day by time
 *  zone; a full ISO instant is printed in the event's own zone (`tz`), or
 *  UTC when it names none. Unreadable → "". */
export function brdcstMoment(value, { tz = null } = {}) {
  if (!value) return "";
  const s = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const m = Number(dateOnly[2]), d = Number(dateOnly[3]);
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return "";
    return `${MONTHS[m - 1]} ${ordinal(d)}`;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(t));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(t));
  }
  const get = (k) => (parts.find((p) => p.type === k) || {}).value || "";
  const m = Number(get("month")), d = Number(get("day"));
  const period = get("dayPeriod").toLowerCase().replace(/\./g, "");
  return `${MONTHS[m - 1]} ${ordinal(d)} ${get("hour")}:${get("minute")} ${period}`.trim();
}

/** The footer's date line for an event: the start, then "→ the end" when
 *  the end is a different moment. */
export function brdcstWhen(event) {
  if (!event) return "";
  const a = brdcstMoment(event.startsAt, { tz: event.tz });
  const b = event.endsAt && event.endsAt !== event.startsAt ? brdcstMoment(event.endsAt, { tz: event.tz }) : "";
  return b ? `${a} → ${b}` : a;
}

/** "Brand: title", as the reference prints it — a title that already begins
 *  with the brand (a demo record: "Visvim – chore coat") is not doubled. */
export function pieceName(item) {
  if (!item) return "";
  const brand = String(item.brand || "").trim(), title = String(item.title || "").trim();
  if (!brand) return title;
  if (!title) return brand;
  const rest = title.toLowerCase().startsWith(brand.toLowerCase()) ? title.slice(brand.length).replace(/^[\s:–—-]+/, "") : title;
  return rest ? `${brand}: ${rest}` : brand;
}

/** The piece popup's price line: "35.00 USD" — two decimals, the currency
 *  after. Null when the record carries no price. */
export function priceLine(item) {
  if (!item || item.price == null || item.price === "") return null;
  const n = Number(item.price);
  if (!Number.isFinite(n)) return `${item.price} ${item.currency || "USD"}`;
  return `${n.toFixed(2)} ${item.currency || "USD"}`;
}

/** What OFFER does on this piece (reference 5.jpg): "native" is the Storefront
 *  offer (slice 6); "wardrobe" is the DM-first Wardrobe offer (chapter 13,
 *  slice 11) on a piece whose owner takes offers; "none" leaves the word
 *  quiet — never a dead button — with the reason it is quiet. */
export function offerMode(item) {
  if (!item) return { mode: "none", reason: "no piece" };
  if (item.commerce_rail === "native") return { mode: "native", reason: "a 24-hour offer to the Storefront seller" };
  if (item.acceptOffers === true && item.ownerId) return { mode: "wardrobe", reason: "an offer starts with a message to the owner (13.4)" };
  if (item.acceptOffers === false && item.ownerId) return { mode: "none", reason: "the owner is not taking Wardrobe offers" };
  return { mode: "none", reason: "an external listing is bought at its source — OFFER is for native and Wardrobe pieces" };
}
