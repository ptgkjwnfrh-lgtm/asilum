// lib/feed/types.js — THE ONE FEED's card law (V.2 Blueprint, owner, 17 Oct
// 2026, Foundations: "one surface for discovery, publishing and commerce.
// There is no Wire"; "Screen map — FEED"; "Tetris packing"). Pure and
// isomorphic: the feed page and the tests read it, the server never needs
// it.
//
// THE TYPES. Every card in the Feed is one of eight: the six publishing
// types TRANSM · STILL · MOTION · BRDCST · LISTING · ECHO and the two
// discovery cards PLACE and SONG. A wire post derives its type from what
// it carries (lib/wire/compose.js kinds: transmission / post / video, the
// event attachment, the echo mark); a catalog piece is a LISTING; a row of
// the places record is a PLACE. SONG waits for a music catalog (owner
// decision, music APIs) and is never invented.
//
// TETRIS PACKING. Visual weight targets from the blueprint: MOTION and
// STILL about 70%, media plus BRDCST 75%, LISTING 45%, PLACE and SONG 20%,
// standalone BRDCST 10%. The packer turns the weight into a span: a card
// at or above FULL_AT takes the whole width and breaks the columns; a
// lighter card takes one column; the lightest keep their column but stay
// short (the component draws them compact). "No accidental gap larger
// than the side border" is the columns' job (lib/feed/rechunk.js
// placeInColumns balances by height); the span decides what the columns
// are asked to balance.
//
// ECHO. A story-style temporary post: 24 hours by default (blueprint 1709:
// "24 hours is the provisional default"), never shown live after expiry
// (Terms 5.4).

export const TYPES = Object.freeze(["TRANSM", "STILL", "MOTION", "BRDCST", "LISTING", "ECHO", "PLACE", "SONG"]);

export const WEIGHT = Object.freeze({
  MOTION: 0.7,
  STILL: 0.7,
  "MEDIA+BRDCST": 0.75,
  LISTING: 0.45,
  PLACE: 0.2,
  SONG: 0.2,
  BRDCST: 0.1,
  TRANSM: 0.3,
  ECHO: 0.2,
});

export const FULL_AT = 0.7;
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

/** The weight a card asks for in the packing. A STILL that carries a
 *  BRDCST is the heaviest card there is (media plus BRDCST, 75%). */
export function weightOf(card) {
  if (!card) return WEIGHT.TRANSM;
  if (card.__post) {
    const t = postType(card.__post);
    const a = card.__post.attachments || {};
    if ((t === "STILL" || t === "MOTION") && a.event) return WEIGHT["MEDIA+BRDCST"];
    return WEIGHT[t];
  }
  if (card.__place) return WEIGHT.PLACE;
  if (card.__song) return WEIGHT.SONG;
  return WEIGHT.LISTING;
}

/** The span: "full" breaks the columns, "column" takes one, "compact" takes
 *  one and stays short. */
export function spanOf(card) {
  const w = weightOf(card);
  if (w >= FULL_AT) return "full";
  if (w <= 0.2) return "compact";
  return "column";
}

/** Tetris-pack a flat list into segments the page renders in order: a run
 *  of column cards becomes one masonry segment; a full-width card stands
 *  alone. A standalone BRDCST (10%) is full width but thin, so it is its
 *  own "strip" segment. */
export function packFeed(list) {
  const out = [];
  let run = [];
  const flush = () => { if (run.length) { out.push({ kind: "grid", items: run }); run = []; } };
  for (const card of list || []) {
    const span = spanOf(card);
    const t = card && card.__post ? postType(card.__post) : null;
    if (t === "BRDCST") { flush(); out.push({ kind: "strip", item: card }); continue; }
    if (span === "full") { flush(); out.push({ kind: "full", item: card }); continue; }
    run.push(card);
  }
  flush();
  return out;
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

/** Braid posts into the pieces: one post after every third piece, the way
 *  the stream did, then the places at a lower rate (one after every
 *  ninth), so discovery cards stay the 20% weight the blueprint gives
 *  them. Echoes are not braided: they live on the rail. */
export function braid(pieces, posts, places = []) {
  const out = [];
  let pi = 0, qi = 0;
  const livePosts = (posts || []).filter((p) => postType(p) !== "ECHO");
  (pieces || []).forEach((it, i) => {
    out.push(it);
    if ((i + 1) % 3 === 0 && livePosts[pi]) { const x = livePosts[pi++]; out.push({ id: "post:" + (x.serverId ?? x.id), __post: x }); }
    if ((i + 1) % 9 === 0 && places[qi]) { const pl = places[qi++]; out.push({ id: "place:" + pl.id, __place: pl }); }
  });
  if ((pieces || []).length < 3) {
    for (const x of livePosts.slice(pi, pi + 2)) out.push({ id: "post:" + (x.serverId ?? x.id), __post: x });
    for (const pl of places.slice(qi, qi + 1)) out.push({ id: "place:" + pl.id, __place: pl });
  }
  return out;
}
