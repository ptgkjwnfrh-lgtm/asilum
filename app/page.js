"use client";

// app/page.js — CATALOG (home).
// Straight clothing (owner order, Aug 12; POST folded into THE WIRE at
// /hotlist by the Aug 13 overhaul — all user posts live there now):
// mode row, one collapsed craving line, filters, then the masonry
// immediately. Cards stay minimal — name, price, fit estimate,
// FAVORITE / ADD TO BAG — everything else lives in the detail view.
// First visit offers a buyer-history scan; the brain underneath is
// unchanged: dwell, skips, zones, graph, rotation.

import { useEffect, useState, useCallback, useRef } from "react";
import { confidenceBand } from "../lib/asterisk/confidence.js";
import Notice from "./components/Notice.jsx";
import { useEscape, useFocusTrap, useOverlayDismiss } from "./components/dismiss.js";
import { fitPhrase } from "../lib/brain/sizing.js";
import { planRechunk, idsBelowFold, applyRechunk, placeInColumns, RECHUNK_AFTER, SERVE_RING_MAX, MAX_RENDERED, CHUNK, CHUNK_MIN } from "../lib/feed/rechunk.js";
import {
  getUid, postJSON, authorizedFetch, thumbFor, bagAdd, safeExternalUrl,
  fitProfileForBrain, brainEnabled, claimRequest, watchRequest, aspectFor, beaconJSON } from "../lib/client.js";
import {
  observationOn, followedBrands, setFollowBrand, isDemoItem, DEMO_LABEL, DEMO_NOTE, isGhostItem, GHOST_LABEL, GHOST_NOTE,
} from "../lib/social.js";
import TicketFlow from "./components/TicketFlow.jsx";
import { ColorEvidenceLine, OriginLine, OriginSticker, useFitProfile } from "./components/ProductSignals.jsx";
import { useLiquidGlass } from "./components/LiquidGlass.jsx";
import FloatView, { askTilt } from "./components/FloatView.jsx";
import PageMast from "./components/PageMast.jsx";

const DWELL_FLUSH_MS = 5000;
const DWELL_MIN_MS = 2000;
// (6 Sep) the feed is served in CHUNKS. The first load fills the folio; every
// chunk after it is smaller so the ranking re-reads the taste sooner, and the
// catalog lane inside each chunk continues from the server's cursor.

// After RECHUNK_AFTER deliberate actions (favourite, bag, share, skip, hide)
// the cards the reader has not reached — below the fold, never examined — are
// regenerated from the taste as it now stands (lib/feed/rechunk.js).
// A card within one full screen below the viewport counts as reached: a card
// the reader was just looking at, or is about to, must never be the one a
// re-chunk replaces (the examined set alone cannot promise that — a card that
// was only half visible is never marked examined).
const RECHUNK_FOLD_MARGIN = () => (typeof window === "undefined" ? 900 : window.innerHeight);

const CATEGORIES = ["tops", "bottoms", "outerwear", "tailoring", "dresses", "knitwear", "footwear", "accessories"];
const PLATFORMS = ["ebay", "pinterest", "shopify"];

const BRIDGE_REASON = {
  alpha: "matches your taste",
  beta: "leans into a trait you love",
  gamma: "connected to pieces you saved",
  delta: "trending on asilum",
  epsilon: "a wildcard for you",
  ad: "sponsored",
};

function reasonFor(item) {
  // The lane is taste-free by law, so it is explained BEFORE any taste line —
  // a craving did not choose it however well it happens to match one.
  if (item._zone === "catalog") return "from the catalog, in listing order";
  if (item._contextMatch >= 0.2) return "matches what you're craving right now";
  if (item._zone === "reach") return "a far reach — break your pattern";
  if (item._zone === "discovery") return "you'll probably like this";
  if (item._via === "graph") return "saved together by others";
  if (item._via === "tags") return "a similar aesthetic";
  const parts = item && item._parts ? item._parts : null;
  if (!parts) return null;
  let bestK = null, bestV = -Infinity;
  for (const k in parts) {
    if (parts[k] > bestV) { bestV = parts[k]; bestK = k; }
  }
  return bestK ? BRIDGE_REASON[bestK] || null : null;
}

function eraLabel(era) {
  if (!era) return null;
  if (era.season && era.year) return era.season + " " + era.year;
  if (era.year) return String(era.year);
  if (era.decade) return era.decade;
  return null;
}

// (Removed Aug 12 at the owner's word — "get rid of a lot of the excess
// header stuff": the FollowMorse strip, THE SLIDE, LIVE OBSERVATION, and
// WHO TO FOLLOW cubes no longer ride above the racks. The observation
// PRIVACY GATE inside the dwell flusher below is separate and stays.)

// The catalog's hairline field (magazine treatment, owner order Aug 13):
// pinned to the page's first stretch so infinite scroll runs past it;
// hand-placed, deterministic, and the masonry keeps the floor — the
// furniture costs zero height.
const CT_HAIRLINES = [
  "ctln-h1", "ctln-h2", "ctln-h3", "ctln-h4",
  "ctln-v1", "ctln-v2", "ctln-v3",
];

export default function Home() {
  const [epsilon, setEpsilon] = useState(false);
  const [epsilonAuto, setEpsilonAuto] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guideOn, setGuideOn] = useState(true);
  const fit = useFitProfile();
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [baggedIds, setBaggedIds] = useState(() => new Set());
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ category: "", maxPrice: "", fitsMe: false });
  const [cravingDraft, setCravingDraft] = useState({ text: "", occasion: "", mood: "", novelty: "discovery" });
  const [craving, setCraving] = useState({ text: "", occasion: "", mood: "", novelty: "discovery" });
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [connecting, setConnecting] = useState("");
  const [modal, setModal] = useState(null);
  // the photograph alone, floating (FloatView): { src, aspect, tilt }
  const [float, setFloat] = useState(null);
  const [modalRel, setModalRel] = useState([]);
  // One dismissal contract (synergy phase 1): Escape closes the open surface.
  const itemDialogRef = useRef(null);
  // the item detail is the same liquid glass as the header (owner, 8 Sep)
  // the popup bends at half the header (owner, 8 Sep: 0.15 read as "no
  // rainbow at all"); where the browser cannot bend a backdrop (Safari), the
  // cards under its edge bend instead
  const modalGlass = useLiquidGlass(itemDialogRef, { id: "lg-item", active: !!modal, strength: 0.5, bend: ".card, .cvlook, .mrelitem" });
  useEscape(() => setModal(null), !!modal);
  // while the photograph floats (FloatView) the float owns Escape and the
  // focus trap; the detail behind it waits
  const dismissItemModal = useOverlayDismiss(() => setModal(null), !!modal && !float);
  const dismissConnectSheet = useOverlayDismiss(useMoodboardInstead, connectOpen);
  // aria-modal="true" below is a promise that the page behind is inert.
  // This is what keeps it.
  useFocusTrap(itemDialogRef, !!modal && !float);
  useEscape(() => { markOnboarded(); setConnectOpen(false); }, connectOpen);
  const [ticketItem, setTicketItem] = useState(null);
  const [tab, setTab] = useState("curated");       // catalog mode: curated | following | new
  const [tabItems, setTabItems] = useState(null);  // following / what's-new items
  const [cravingOpen, setCravingOpen] = useState(false);
  const [stamp, setStamp] = useState("");
  const promptRef = useRef("");
  const boardParamRef = useRef("");
  const uidRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const feedGenRef = useRef(0);
  const sentinelRef = useRef(null);

  const fitBrain = fitProfileForBrain(fit);

  // The folio's edition date — set on mount like the cover's masthead.
  useEffect(() => {
    setStamp(new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }).toUpperCase());
  }, []);

  // ---- Dwell tracking ----
  const dwellRef = useRef({ vis: new Map(), sent: new Set() });
  // (r19) Which slots of the current serve the user actually looked at. The
  // tuning denominator used to be every slot the server sent — position bias
  // straight into the training signal. We report ids only; the server knows
  // which bridge each was.
  // (6 Sep) one record PER SERVE — the first load and every chunk after it —
  // each reported once against its own id. Newest first, bounded like the
  // server's ring. `examinedAllRef` is the union, for the re-chunk plan.
  const servesRef = useRef([]);
  const examinedAllRef = useRef(new Set());
  const noteServe = (data, ids) => {
    if (!data || !data.serveId) return;
    servesRef.current = [
      // A record born while observation is off is silent from the start —
      // not from the next five-second tick.
      { id: data.serveId, ids: new Set(ids), examined: new Set(), sent: !observationOn(), settled: 0 },
      ...servesRef.current.filter((s) => s.id !== data.serveId),
    ].slice(0, SERVE_RING_MAX);
  };
  // Post every unsent examination record once. A record is marked sent
  // before the request so a tick cannot post it twice; a network failure
  // unmarks it for the next tick. A refused request (429, 503, or a 401 from
  // a bearer that expired while the tab idled) stays sent —
  // that serve's denominator is simply under-counted; nothing falls back.
  const SETTLE_IDLE_TICKS = 6; // ~30 s: a reader who stopped mid-serve still reports
  const flushBeacons = (user, { immediate = false, final = false } = {}) => {
    for (const serve of servesRef.current) {
      if (serve.sent || !serve.examined.size) continue;
      // A serve is reported ONCE (the server refuses a second report as a
      // duplicate), so it is reported when the reader has LEFT it: its
      // examined set has stopped growing AND none of its cards is on screen
      // (the dwell map knows), or it has sat unchanged for a while. Reporting
      // at the first tick reported one viewport of a sixty-card page; a
      // reader who pauses on each viewport would lose most of the rest.
      // `immediate` (pagehide) and `final` (the page is being replaced) send
      // whatever there is.
      if (!immediate && !final) {
        if (serve.examined.size !== serve.settled) { serve.settled = serve.examined.size; serve.idle = 0; continue; }
        serve.idle = (serve.idle || 0) + 1;
        const vis = dwellRef.current.vis;
        let onScreen = false;
        for (const id of serve.ids) { const rec = vis.get(id); if (rec && rec.start != null) { onScreen = true; break; } }
        if (onScreen && serve.idle < SETTLE_IDLE_TICKS) continue;
      }
      serve.sent = true;
      const body = { user, serveId: serve.id, examined: [...serve.examined] };
      // keepalive: a full-page navigation (every destination is a plain link)
      // aborts an ordinary fetch; this one is allowed to finish. On pagehide
      // the request must be ISSUED before the document goes — no awaiting the
      // auth chain — so it goes out synchronously with the last known headers.
      const req = immediate ? beaconJSON("/api/impressions", body) : postJSON("/api/impressions", body, { keepalive: true });
      req.catch(() => { serve.sent = false; });
    }
  };
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const gridCols = useColumnCount();
  // Column memories per list, kept across tab round-trips.
  const curatedColsRef = useRef({ count: 0, map: new Map() });
  const followingColsRef = useRef({ count: 0, map: new Map() });
  const newColsRef = useRef({ count: 0, map: new Map() });
  // A card's height in column widths: the tile aspect plus the caption.
  const cardWeight = useCallback((it) => {
    const [w, h] = String(aspectFor(it.id)).split("/").map((x) => Number(x));
    return (Number.isFinite(w) && Number.isFinite(h) && w > 0 ? h / w : 1.2) + 0.45;
  }, []);
  // Which tab is on screen, for handlers that resolve after a switch.
  const tabRef = useRef("curated");
  useEffect(() => { tabRef.current = tab; }, [tab]);
  // The brain switch reloads the feed when it is TOGGLED (the event), not
  // when this mirror first reads it on mount — a paused reader used to pay a
  // second cold-load request for the mirror catching up.
  const loadFeedRef = useRef(null);
  useEffect(() => {
    const sync = (e) => { setGuideOn(brainEnabled()); if (e && loadFeedRef.current) loadFeedRef.current(); };
    sync();
    window.addEventListener("asilum:brain", sync);
    return () => window.removeEventListener("asilum:brain", sync);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const d = dwellRef.current;
    const obs = new IntersectionObserver((entries) => {
      const now = performance.now();
      for (const en of entries) {
        const id = en.target.getAttribute("data-id");
        if (!id) continue;
        const rec = d.vis.get(id) || { start: null, total: 0 };
        if (en.isIntersecting) {
          if (rec.start == null) rec.start = now;
          examinedAllRef.current.add(id);
          const owner = servesRef.current.find((s) => s.ids.has(id));
          if (owner) owner.examined.add(id);
        } else if (rec.start != null) {
          rec.total += now - rec.start;
          rec.start = null;
        }
        d.vis.set(id, rec);
      }
    }, { threshold: 0.55 });
    document.querySelectorAll(".card[data-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // (The POST sub-view is gone — owner overhaul, Aug 13 — so the card
    // nodes only remount when `items` changes.)
  }, [items]);

  function dwellMsFor(id) {
    const rec = dwellRef.current.vis.get(id);
    if (!rec) return 0;
    let t = rec.total;
    if (rec.start != null) t += performance.now() - rec.start;
    return Math.round(t);
  }

  useEffect(() => {
    const iv = setInterval(() => {
      const user = uidRef.current;
      if (!user) return;
      const d = dwellRef.current;
      // WHAT WAS WRONG (Aug 8, codebase audit). The ON-DEVICE TASTE OBSERVATION
      // switch in Settings was decorative. observationOn() was read in exactly
      // two places — to render this module and to render the toggle itself —
      // and NOTHING gated the sends below. Turning it OFF hid a panel while
      // dwell events and examination reports kept flowing to the server, under
      // settings copy promising "the brain only learns from explicit actions".
      // A privacy control that controls nothing is worse than no control.
      //
      // Dwell and examination are both PASSIVE attention signals, so both are
      // gated. Explicit actions (favourite, bag, share, skip) are unaffected,
      // which is exactly what the copy promises. Pending records are consumed
      // rather than left queued, so turning observation back on never flushes
      // a backlog collected while it was off.
      //
      // HONEST LIMIT: this is a client-side control. It genuinely stops this
      // client sending, and the r19 path treats a missing examination report
      // as an under-counted denominator for that serve (there is no fallback
      // to served counts under the default flag). It is not a server-enforced consent
      // record; a modified client could still post. Making it server-side
      // wants asterisk_memory_preferences and its own round.
      if (!observationOn()) {
        for (const [id, rec] of d.vis) {
          const t = rec.total + (rec.start != null ? performance.now() - rec.start : 0);
          if (t >= DWELL_MIN_MS) d.sent.add(id);
        }
        for (const s of servesRef.current) s.sent = true;
        return;
      }
      const now = performance.now();
      const events = [];
      for (const [id, rec] of d.vis) {
        if (d.sent.has(id)) continue;
        const t = rec.total + (rec.start != null ? now - rec.start : 0);
        if (t < DWELL_MIN_MS) continue;
        const item = itemsRef.current.find((x) => x.id === id);
        if (!item) continue;
        events.push({ item: { id: item.id, tags: item.tags, _bridge: item._bridge }, action: "dwell", dwellMs: Math.round(t) });
        d.sent.add(id);
      }
      if (events.length) {
        // D4 courtesy gate: passive dwell rides only under OBSERVE — the
        // server refuses it anyway; this just saves the wire.
        let consent = null;
        try { consent = window.localStorage.getItem("asilum-consent"); } catch {}
        if (consent === "observe") {
          postJSON("/api/interaction", { user, events }).catch(() => {});
        }
      }
      // (r19) one examination report per serve, sent once the page has
      // settled.
      flushBeacons(user);
    }, DWELL_FLUSH_MS);
    // The page is leaving (a link, a close): report what was examined now.
    const onHide = () => { const user = uidRef.current; if (user && observationOn()) flushBeacons(user, { immediate: true }); };
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(iv); window.removeEventListener("pagehide", onHide); };
  }, []);

  // ---- Feed ----
  // The catalog lane's position, as the server last reported it. Null means
  // "from the top"; a reload resets it; an exhausted lane keeps its cursor so
  // the next chunk says so instead of wrapping.
  const cursorRef = useRef(null);
  const cursorKeyRef = useRef("");
  // After a refused reload, the earliest moment a scroll may retry it.
  const retryAtRef = useRef(0);
  const actionsSinceChunkRef = useRef(0);
  // A reload in flight: appends and re-chunks wait for it rather than racing
  // it (a plan made against the old list must never be applied to the new).
  const reloadingRef = useRef(false);
  // The current re-chunk closure, so an action that resolves after a filter
  // change re-chunks with the NEW filters, not the ones it was born under.
  const rechunkRef = useRef(null);

  const feedQS = useCallback((user, { limit, cursor } = {}) => {
    const qs = new URLSearchParams({ user, epsilon: epsilon ? "1" : "0", q: promptRef.current });
    if (limit) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", cursor);
    if (boardParamRef.current) qs.set("board", boardParamRef.current);
    if (filters.category) qs.set("category", filters.category);
    if (filters.maxPrice) qs.set("maxPrice", filters.maxPrice);
    if (filters.fitsMe && fit.usualSize) qs.set("fit", fit.usualSize);
    if (craving.text) qs.set("craving", craving.text);
    if (craving.occasion) qs.set("occasion", craving.occasion);
    if (craving.mood) qs.set("mood", craving.mood);
    if (craving.novelty) qs.set("novelty", craving.novelty);
    return qs;
  }, [epsilon, filters, fit.usualSize, craving]);

  const loadFeed = useCallback(async (user = uidRef.current) => {
    if (!user) return;
    // A reload claims a new feed generation: a slower older response (e.g. a
    // pending personalized feed after a craving/filter change) must never
    // overwrite the feed a newer request owns.
    const isCurrent = claimRequest(feedGenRef);
    setLoading(true);
    reloadingRef.current = true;
    // What was examined on the page being replaced is reported now, not lost
    // to the reset below.
    if (observationOn()) flushBeacons(user, { final: true });
    const previousCursor = cursorRef.current;
    const previousKey = cursorKeyRef.current;
    cursorRef.current = null;
    // A cursor belongs to the filter set it was made under: a listing key
    // from one category sent with another can sit past that listing's end
    // and kill the lane for the session.
    cursorKeyRef.current = feedQS(user).toString();
    actionsSinceChunkRef.current = 0;
    try {
      const res = await authorizedFetch("/api/feed?" + feedQS(user).toString());
      const data = await res.json();
      if (!isCurrent()) return;
      // A refused reload (rate limit, outage) keeps the feed it has — and its
      // cursor — rather than replacing it with "nothing matches", and says so.
      if (!res.ok || !Array.isArray(data.items)) {
        cursorRef.current = previousCursor;
        cursorKeyRef.current = previousKey;
        retryAtRef.current = Date.now() + 1000 * (Number(res.headers.get("Retry-After")) || 10);
        setNotice(res.status === 429 ? "the feed is busy — kept what you had" : "could not refresh the feed — kept what you had");
        return;
      }
      setItems(data.items || []);
      cursorRef.current = data.chunk?.catalog?.nextCursor || null;
      setEpsilonAuto(!!data.epsilonAuto);
      if (data.boardSeeded) setNotice("feed seeded from a moodboard you follow or opened");
      else if (data.craving) setNotice("current craving applied — your long-term taste was not rewritten");
      dwellRef.current = { vis: new Map(), sent: new Set() };
      openedRef.current = new Set();
      // (r19) a new serve: report examined slots against THIS id, once.
      servesRef.current = [];
      examinedAllRef.current = new Set();
      noteServe(data, (data.items || []).map((x) => x.id));
    } catch (e) {
      console.error(e);
    } finally {
      if (isCurrent()) { setLoading(false); reloadingRef.current = false; }
    }
  }, [feedQS]);

  function applyCraving() {
    setTab("curated");
    setCravingOpen(false);
    setCraving({ ...cravingDraft, text: cravingDraft.text.trim().slice(0, 240) });
  }

  function clearCraving() {
    const empty = { text: "", occasion: "", mood: "", novelty: "discovery" };
    setCravingDraft(empty);
    setCraving(empty);
  }

  const loadMore = useCallback(async () => {
    const user = uidRef.current;
    if (!user) return;
    if (loadingMoreRef.current || reloadingRef.current) { wantMoreRef.current = true; return; }
    // The cursor's filter key differs from the current filters only when the
    // last reload was refused: the page shows old-filter cards under new
    // chips (or nothing at all). A scroll then retries the reload — no
    // sooner than the server's Retry-After — rather than appending a page
    // that matches neither. Checked before the empty/ceiling returns so an
    // empty or full page can recover too.
    if (cursorKeyRef.current !== feedQS(user).toString()) {
      if (Date.now() >= retryAtRef.current) loadFeed(user);
      return;
    }
    if (itemsRef.current.length === 0 || itemsRef.current.length >= MAX_RENDERED) return;
    // Ask for what can still render: a served card that never renders is
    // struck from the reader's listing walk unseen.
    const room = Math.min(CHUNK, MAX_RENDERED - itemsRef.current.length);
    loadingMoreRef.current = true;
    // Appends observe the feed generation without claiming it: a page fetched
    // for a feed that has since reloaded must be dropped, not appended.
    const isCurrent = watchRequest(feedGenRef);
    actionsSinceChunkRef.current = 0;
    try {
      const sameFilters = cursorKeyRef.current === feedQS(user).toString();
      const qs = feedQS(user, { limit: Math.max(CHUNK_MIN, room), cursor: sameFilters ? cursorRef.current : null });
      const res = await authorizedFetch("/api/feed?" + qs.toString());
      const data = await res.json();
      if (!isCurrent()) return;
      if (data.chunk?.catalog?.nextCursor) cursorRef.current = data.chunk.catalog.nextCursor;
      if (data.items && data.items.length) {
        noteServe(data, data.items.map((x) => x.id));
        setItems((prev) => {
          const have = new Set(prev.map((x) => x.id));
          return [...prev, ...data.items.filter((x) => !have.has(x.id))].slice(0, MAX_RENDERED);
        });
      }
    } catch (e) { console.error(e); }
    finally { loadingMoreRef.current = false; }
  }, [feedQS, loadFeed]);
  useEffect(() => { loadFeedRef.current = loadFeed; }, [loadFeed]);

  // A deliberate action moved the taste; once enough of them have landed, the
  // part of the feed the reader has NOT reached is rebuilt from the taste as it
  // now stands. Nothing on or above the screen moves: only cards entirely
  // below the fold that were never examined are replaced (the grid flows
  // column-major, so list position says nothing about reach — geometry does),
  // and only when enough of them exist to be worth it — otherwise the next
  // scroll fetches a fresh chunk anyway, since every chunk is built at request
  // time.
  // A scroll that reached the sentinel while a chunk was in flight is
  // remembered and served when that chunk lands: an in-place re-chunk does
  // not move the sentinel, so the observer would never fire again.
  const wantMoreRef = useRef(false);
  const rechunk = useCallback(async () => {
    const user = uidRef.current;
    if (!user || typeof document === "undefined") return;
    // The plan reads the curated grid's geometry; on another tab the DOM is
    // that tab's, and the curated list must not be rearranged unseen.
    if (tabRef.current !== "curated") return;
    if (loadingMoreRef.current || reloadingRef.current) return;
    // A favourite's "more like this" cards count as reached — they are the
    // reader's own ask — for the gate, the request size AND the placement.
    const reached = () => new Set([
      ...examinedAllRef.current,
      ...itemsRef.current.filter((x) => x && x._via).map((x) => String(x.id)),
    ]);
    const plan = planRechunk(
      itemsRef.current,
      reached(),
      idsBelowFold(document, window.innerHeight, RECHUNK_FOLD_MARGIN()),
    );
    if (!plan) return;
    loadingMoreRef.current = true;
    actionsSinceChunkRef.current = 0;
    const isCurrent = watchRequest(feedGenRef);
    try {
      // Every chunk is ranked on the taste as it stands and skips what the
      // cursor says was served, so a re-chunk is an ordinary chunk request.
      const sameFilters = cursorKeyRef.current === feedQS(user).toString();
      // Sized to what can render: the planned replacements plus any room under
      // the ceiling, never the full chunk for its own sake.
      const room = Math.max(0, MAX_RENDERED - itemsRef.current.length);
      const want = Math.max(CHUNK_MIN, Math.min(CHUNK, plan.dropped.length + room));
      const qs = feedQS(user, { limit: want, cursor: sameFilters ? cursorRef.current : null });
      const res = await authorizedFetch("/api/feed?" + qs.toString());
      const data = await res.json();
      if (!isCurrent()) return;
      if (data.chunk?.catalog?.nextCursor) cursorRef.current = data.chunk.catalog.nextCursor;
      if (data.items && data.items.length) {
        noteServe(data, data.items.map((x) => x.id));
        // Replace the planned cards IN PLACE and only those: anything that
        // arrived or left while the chunk was in flight keeps its place. The
        // plan is re-checked against the geometry NOW — the reader may have
        // scrolled a screen while the chunk was in flight — so a card that
        // came into view since is kept.
        const belowNow = idsBelowFold(document, window.innerHeight, RECHUNK_FOLD_MARGIN());
        setItems((prev) => {
          // Re-plan against the live list and the geometry NOW, with no
          // minimum: the chunk is already served, so whatever can be placed
          // replaces something rather than being discarded at the ceiling.
          const fresh = planRechunk(prev, reached(), belowNow, 0);
          const dropped = fresh ? fresh.dropped.slice(0, data.items.length) : [];
          return applyRechunk(prev, dropped, data.items, { max: MAX_RENDERED });
        });
      }
    } catch (e) { console.error(e); }
    finally {
      loadingMoreRef.current = false;
      if (wantMoreRef.current) { wantMoreRef.current = false; loadMore(); }
    }
  }, [feedQS, loadMore]);
  useEffect(() => { rechunkRef.current = rechunk; }, [rechunk]);

  function noteDeliberateAction() {
    actionsSinceChunkRef.current += 1;
    if (actionsSinceChunkRef.current >= RECHUNK_AFTER && rechunkRef.current) rechunkRef.current();
  }

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "700px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
    // The sentinel node is mounted only on the curated tab, so the observer
    // is re-attached when the reader comes back to it (it used to be dead
    // after a tab round-trip — a verifier's finding, 7 Sep).
  }, [loadMore, tab]);

  // ---- Boot: identity, search hand-off, shared links, first-visit connect ----
  useEffect(() => {
    const user = getUid();
    uidRef.current = user;
    const sp = new URLSearchParams(window.location.search);
    boardParamRef.current = sp.get("board") || "";
    const q = sp.get("q") || "";
    const sharedItem = sp.get("item");
    const onboarded = (() => {
      try { return !!window.localStorage.getItem("asilum-onboarded"); } catch { return true; }
    })();
    if (!onboarded && !boardParamRef.current && !sharedItem && !q) setConnectOpen(true);

    const boot = async () => {
      if (q) {
        promptRef.current = q;
        setNotice(`The Asterisk system is routing this edit toward “${q}” without rewriting your Passport`);
      }
      await loadFeed(user);
      if (sharedItem) {
        fetch("/api/related?item=" + encodeURIComponent(sharedItem) + "&limit=6")
          .then((r) => r.json())
          .then((d) => {
            if (d.item) {
              setModal(d.item);
              setModalRel((d.items || []).slice(0, 6));
            }
            if (d.items && d.items.length) {
              setNotice("showing pieces connected to a shared item");
              setItems((prev) => {
                const have = new Set(d.items.map((x) => x.id));
                return [...d.items, ...prev.filter((x) => !have.has(x.id))];
              });
            }
          })
          .catch(() => {});
      }
    };
    boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reloads on a change of filters, craving, epsilon, guidance or fit size —
  // not on mount, where the boot effect has already loaded (a cold load used
  // to make two requests, the first discarded, both recorded as served).
  const reloadPrimedRef = useRef(false);
  useEffect(() => {
    if (!reloadPrimedRef.current) { reloadPrimedRef.current = true; return; }
    if (uidRef.current) loadFeed();
    // The fit size matters only while the FITS ME filter is on.
  }, [filters, epsilon, craving, filters.fitsMe ? fit.usualSize : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  function markOnboarded() {
    try {
      window.localStorage.setItem("asilum-onboarded", "1");
      // The account popup waits behind the first-visit sheet; let it know.
      window.dispatchEvent(new CustomEvent("asilum:onboarded"));
    } catch {}
  }

  // ---- Catalog modes ----
  // Following: pieces from brands you follow + boards you follow (posts from
  // people live on the POST sub-page now). What's New: the freshest inventory
  // across the affiliated sites, source-labeled.
  async function switchTab(next) {
    setTab(next);
    if (next === "curated") return;
    setTabItems(null);
    try {
      if (next === "new") {
        const d = await fetch("/api/discover?sort=new&limit=48").then((r) => r.json());
        setTabItems(d.items || []);
      } else if (next === "following") {
        const seen = new Set();
        const pool = [];
        // pieces from followed brands
        const brands = followedBrands();
        if (brands.length) {
          const d = await fetch("/api/discover?brands=" + encodeURIComponent(brands.join("|")) + "&limit=48")
            .then((r) => r.json());
          for (const it of d.items || []) {
            if (!seen.has(it.id)) { seen.add(it.id); pool.push(it); }
          }
        }
        // pieces from followed moodboards
        const prof = await authorizedFetch("/api/profile?user=" + encodeURIComponent(uidRef.current))
          .then((r) => (r.ok ? r.json() : null));
        const follows = (prof?.profile && prof.profile._meta && prof.profile._meta.follows) || [];
        const boards = await Promise.all(
          follows.map((id) => fetch("/api/boards?id=" + encodeURIComponent(id))
            .then((r) => (r.ok ? r.json() : null)).catch(() => null))
        );
        for (const b of boards) {
          for (const it of (b && b.board && b.board.items) || []) {
            if (!seen.has(it.id)) { seen.add(it.id); pool.push(it); }
          }
        }
        setTabItems(pool);
      }
    } catch { setTabItems([]); }
  }

  // (The POST sub-page moved to THE WIRE — owner overhaul, Aug 13: all
  // user posts live at /hotlist now; this page is straight clothing.)

  async function connect(platform) {
    if (connecting) return;
    setConnecting(platform);
    try {
      const res = await postJSON("/api/connect", { user: uidRef.current, platform });
      const d = await res.json().catch(() => null);
      setConnectNote((d && d.message) || `${platform} linking is coming soon — teach the feed with the moodboard instead`);
    } catch (e) { console.error(e); }
    setConnecting("");
  }

  function useMoodboardInstead() {
    markOnboarded();
    setConnectOpen(false);
    setNotice("no account connected — favorite pieces, build your moodboard, and follow boards to teach the feed");
    loadFeed();
  }

  // ---- Signals ----
  // "More like this" after a favourite. It used to SPLICE four cards into the
  // list after the favourited one; under index-bucketed columns a splice
  // re-buckets every card after it (the same shift a re-chunk avoids), so
  // the related pieces now REPLACE the next cards after the favourite that
  // are below the fold and never examined — same count, same geometry, the
  // reader finds them where the feed continues. With nothing replaceable
  // (end of the list, everything seen) they append.
  function insertRelatedAfter(afterId, newItems, cap = 4) {
    // Only for a favourite made ON the curated page: elsewhere the geometry
    // read below is another tab's, and the curated list must not change
    // unseen. A favourite on a card that is not in the list (the modal's
    // related strip) adds nothing either.
    if (tabRef.current !== "curated") return;
    const below = typeof document === "undefined" ? new Set() : idsBelowFold(document, window.innerHeight, RECHUNK_FOLD_MARGIN());
    setItems((prev) => {
      const have = new Set(prev.map((x) => x.id));
      const add = newItems.filter((x) => !have.has(x.id)).slice(0, cap);
      if (!add.length) return prev;
      const idx = prev.findIndex((x) => x.id === afterId);
      if (idx < 0) return prev;
      const dropped = [];
      for (let k = Math.max(0, idx + 1); k < prev.length && dropped.length < add.length; k++) {
        const id = prev[k].id;
        if (below.has(id) && !examinedAllRef.current.has(id)) dropped.push(id);
      }
      return applyRechunk(prev, dropped, add, { max: MAX_RENDERED });
    });
  }

  async function moreLikeThis(item) {
    try {
      const res = await fetch("/api/related?item=" + encodeURIComponent(item.id) + "&limit=8");
      const data = await res.json();
      if (data.items) insertRelatedAfter(item.id, data.items, 4);
    } catch (e) { console.error(e); }
  }

  async function react(item, action) {
    const dwellMs = dwellMsFor(item.id);
    if (action === "hide" || action === "skip") {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      if (modal && modal.id === item.id) setModal(null);
    }
    try {
      const res = await postJSON("/api/interaction", { user: uidRef.current, item, action, dwellMs });
      if (action === "favorite") moreLikeThis(item);
      // The profile has the action now — only if the server took it — and
      // the next chunk can read it.
      if (res && res.ok && action !== "dwell") noteDeliberateAction();
    } catch (e) { console.error(e); }
  }

  function addToBag(item) {
    bagAdd(item);
    setBaggedIds((prev) => new Set(prev).add(item.id));
    // react() counts the bag once the server has it — never before, never twice.
    react(item, "bag");
  }

  // WHAT WAS WRONG (Aug 8, codebase audit). This posted a SYNTHETIC item with
  // a made-up id ("mute:TAG:timestamp"). /api/interaction resolves every id
  // through resolveProducts and answers 400 "unknown product" for anything not
  // in the catalog, so the request ALWAYS failed. postJSON returns a fetch,
  // which does not throw on 4xx, so the catch never ran and the code went
  // straight on to close the modal and reload the feed — the control looked
  // like it worked, every time, and taught the brain nothing.
  //
  // It now sends a REAL skip on the REAL piece being viewed. That is an
  // existing, honoured negative signal, and because the brain scores a skip
  // against the item's whole tag vector it does move the clicked tag down.
  //
  // WHAT IT IS NOT: a tag-scoped mute. Nothing in the codebase supports one —
  // user_corrections exclusions are brand- and product-scoped only, and
  // getUserRecommendationExclusions reads nothing else. Building a real
  // per-tag mute is new product behaviour and an owner decision, not something
  // to invent inside a bug fix. The tooltip now says what actually happens.
  async function muteTag(item) {
    if (!item?.id) return;
    try {
      const res = await postJSON("/api/interaction", {
        user: uidRef.current, item, action: "skip",
      });
      if (!res?.ok) {
        setNotice("could not record that — try again");
        return;
      }
      setModal(null);
      loadFeed();
    } catch (e) {
      console.error(e);
      setNotice("could not record that — try again");
    }
  }

  async function saveToBoard(item) {
    setSavedIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await postJSON("/api/boards", { user: uidRef.current, item });
      // A save is a deliberate action like a favourite; it counts.
      if (res && res.ok) noteDeliberateAction();
    } catch (e) { console.error(e); }
  }

  // Real checkout (18 Aug): renders ONLY where the server stamped
  // purchasable:true — the gate's verdict, never re-derived client-side.
  // The redirect goes to Stripe's hosted page; refusals show the server's
  // own words.
  function startPurchase(item) {
    // The housing (/checkout) is the ONE buyer flow — fee, ticket, source
    // hand-off, with the piece on screen throughout (owner order, 20 Aug).
    window.location.href = "/checkout?item=" + encodeURIComponent(item.id);
  }

  async function shareItem(item) {
    // /piece/<id>, not /?item=<id>: the stable path carries the piece's OWN
    // link preview (app/piece/[id]/page.js). The old query-parameter form still
    // works — links already shared must not rot — but a new share should be the
    // one that previews correctly.
    const url = window.location.origin + "/piece/" + encodeURIComponent(item.id);
    try { await navigator.clipboard.writeText(url); setNotice("item link copied — it carries its taste graph"); } catch {}
    postJSON("/api/interaction", { user: uidRef.current, item, action: "share", dwellMs: dwellMsFor(item.id) })
      .then((res) => { if (res && res.ok) noteDeliberateAction(); }).catch(() => {});
  }

  const [modalEvidence, setModalEvidence] = useState(null);
  const [modalSameShot, setModalSameShot] = useState(null);

  // Opening a record is a click the reader chose: it teaches (weight 0.1)
  // and counts toward the re-chunk, once per piece per page.
  const openedRef = useRef(new Set());
  function openModal(item) {
    setModal(item);
    if (item && item.id && !openedRef.current.has(item.id)) {
      openedRef.current.add(item.id);
      react(item, "open");
    }
    setModalRel([]);
    setModalEvidence(null);
    setModalSameShot(null);
    fetch("/api/related?item=" + encodeURIComponent(item.id) + "&limit=6")
      .then((r) => r.json())
      .then((d) => {
        setModalRel(d.items || []);
        // Arrives with the related pieces, on the request that was happening
        // anyway. Absent below the stake threshold, and then this stays null
        // and nothing renders. docs/INVISIBLE-MACHINERY.md.
        setModalEvidence(d.evidence || null);
        setModalSameShot(d.sameShot || null);
      })
      .catch(() => {});
  }

  const cravingActive =
    craving.text || craving.occasion || craving.mood || craving.novelty !== "discovery";

  // Real zone composition of the loaded pass — printed as gutter
  // marginalia (magazine treatment, owner order Aug 13; every value is
  // real state).
  const zones = items.reduce(
    (z, it) => {
      // A related piece (after a favourite, or a shared link's neighbours) is
      // neither zone nor core.
      z[it._via ? "related" : it._zone === "reach" ? "reach" : it._zone === "discovery" ? "discovery" : it._zone === "catalog" ? "catalog" : "core"] += 1;
      return z;
    },
    { core: 0, discovery: 0, reach: 0, catalog: 0, related: 0 },
  );

  return (
    <div className="wrap ctr">
      <div className="cvlines ctlines" aria-hidden="true">
        {CT_HAIRLINES.map((c) => <i key={c} className={c} />)}
      </div>
      <header className="cthead">
        <PageMast word="THE FEED" sub="YOUR CURATED EDIT" />
        {stamp && (
          <div className="ctmeta">
            LIVE EDIT · {stamp}
            {items.length > 0 && (
              <span>{items.length} PIECES THIS PASS</span>
            )}
          </div>
        )}
      </header>
      {/* DEMO MODE banner (owner ruling, Aug 16). Deliberately in normal flow
          directly under the masthead rather than inside `.cthead`, which is a
          laid-out row — dropped in there it fought the headline for the same
          space. A per-card DEMO flag tells you about one record; only a
          page-level statement tells you the whole shelf is sample data. */}
      <p className="demobanner" role="note">
        <b>DEMO CATALOG.</b> every piece here is synthetic sample data with
        placeholder imagery — not real inventory, not for sale, and no prices,
        sizes or availability shown are real. taste learning is genuine; the
        clothes are not.
      </p>
      <p className="deck">
        {guideOn
          ? "The Asterisk system routed this edit through your Passport — no reruns."
          : "The Asterisk system is paused — this is a general edit. Your Passport is still waiting when you return."}
      </p>

      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}

      <>
          {items.length > 0 && (
            <span className="cvside ctside" aria-hidden="true">
              ZONES — CORE {zones.core} · DISCOVERY {zones.discovery} · FAR REACH {zones.reach} · CATALOG {zones.catalog}{zones.related ? ` · RELATED ${zones.related}` : ""}
            </span>
          )}
          <span className="cvside cvsider ctsider" aria-hidden="true">
            ASTERISK — {guideOn ? "GUIDING" : "PAUSED"}
          </span>
          <div className="fmodes">
            {[["curated", "CURATED"], ["following", "FOLLOWING"], ["new", "WHAT'S NEW"]].map(([k, label]) => (
              <button key={k} className={"fmode" + (tab === k ? " cur" : "")} onClick={() => switchTab(k)}>
                {label}
              </button>
            ))}
            <button className="fmode cravtoggle" onClick={() => setCravingOpen((o) => !o)}>
              CURRENT CRAVING {cravingActive ? "· ON" : ""} {cravingOpen ? "−" : "+"}
            </button>
            {cravingActive && (
              <button className="txtbtn" onClick={clearCraving}>CLEAR CRAVING</button>
            )}
          </div>

          {cravingOpen && (
            <section className="cravingline" aria-label="current craving">
              <p className="cravnote">tell the tollbooth what this moment needs. it steers this feed without changing your permanent taste.</p>
              <div className="cravinggrid">
                <input aria-label="what you are looking for"
                  type="text"
                  maxLength={240}
                  placeholder="dark dinner look, clean but strange, airport armor…"
                  value={cravingDraft.text}
                  onChange={(e) => setCravingDraft((c) => ({ ...c, text: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && applyCraving()}
                />
                <select aria-label="occasion" value={cravingDraft.occasion} onChange={(e) => setCravingDraft((c) => ({ ...c, occasion: e.target.value }))}>
                  <option value="">any occasion</option>
                  <option value="everyday">everyday</option><option value="work">work</option>
                  <option value="date">date</option><option value="night">night</option>
                  <option value="event">event</option><option value="travel">travel</option>
                  <option value="outdoors">outdoors</option>
                </select>
                <select aria-label="mood" value={cravingDraft.mood} onChange={(e) => setCravingDraft((c) => ({ ...c, mood: e.target.value }))}>
                  <option value="">any mood</option>
                  <option value="quiet">quiet</option><option value="sharp">sharp</option>
                  <option value="romantic">romantic</option><option value="experimental">experimental</option>
                  <option value="nostalgic">nostalgic</option><option value="practical">practical</option>
                </select>
                <select aria-label="novelty" value={cravingDraft.novelty} onChange={(e) => setCravingDraft((c) => ({ ...c, novelty: e.target.value }))}>
                  <option value="safe">safe bet</option><option value="discovery">discovery</option>
                  <option value="wildcard">wildcard</option>
                </select>
                <button className="btn" onClick={applyCraving}>POINT THE WAY</button>
              </div>
            </section>
          )}

          <div className="filters">
            <select aria-label="filter by category"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">all categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input aria-label="maximum price"
              type="number"
              placeholder="max price"
              value={filters.maxPrice}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
            />
            <label className="toggle" title={fit.usualSize ? "" : "set your size in PROFILE first"}>
              <input
                type="checkbox"
                disabled={!fit.usualSize}
                checked={filters.fitsMe}
                onChange={(e) => setFilters((f) => ({ ...f, fitsMe: e.target.checked }))}
              />
              fits me
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={epsilon}
                onChange={(e) => setEpsilon(e.target.checked)}
              />
              epsilon
            </label>
          </div>

          {epsilonAuto && (
            <Notice variant="banner">trying something different — you seemed in a rut</Notice>
          )}

          {tab === "curated" && (
            <>
              {loading && <div className="empty">thinking…</div>}
              {!loading && items.length === 0 && (
                <div className="empty">Nothing matches — loosen the filters or search a mood.</div>
              )}
              <Columns count={gridCols} items={items} memo={curatedColsRef} weight={cardWeight} render={(it) => (
                  <FragmentCard
                    key={it.id}
                    it={it}
                    fitLine={fitPhrase(it.size, fitBrain)}
                    bagged={baggedIds.has(it.id)}
                    onOpen={() => openModal(it)}
                    onFavorite={() => react(it, "favorite")}
                    onPass={() => react(it, "skip")}
                    onBag={() => addToBag(it)}
                  />
                )} />
              <div ref={sentinelRef} className="sentinel" />
            </>
          )}

          {tab === "following" && (
            <>
              {!tabItems && <div className="empty">reading who and what you follow…</div>}
              {tabItems && tabItems.length === 0 && (
                <div className="empty">
                  nothing here yet — follow brands (from any piece) and moodboards
                  (open a shared board and hit FOLLOW) to build this rack.
                  posts from people live on the POST page.
                </div>
              )}
              {tabItems && tabItems.length > 0 && (
                <Columns count={gridCols} items={tabItems} memo={followingColsRef} weight={cardWeight} render={(it) => (
                    <FragmentCard
                      key={it.id}
                      it={it}
                      fitLine={fitPhrase(it.size, fitBrain)}
                      bagged={baggedIds.has(it.id)}
                      onOpen={() => openModal(it)}
                      onFavorite={() => react(it, "favorite")}
                    onPass={() => react(it, "skip")}
                      onBag={() => addToBag(it)}
                    />
                  )} />
              )}
            </>
          )}

          {tab === "new" && (
            <>
              {/* "just in from the affiliated sites" claimed a live feed from
                  partners that does not exist. Newest-first is true; where the
                  records come from is not. */}
              <p className="deck">newest sample records first.</p>
              {!tabItems && <div className="empty">pulling the fresh racks…</div>}
              {tabItems && (
                <Columns count={gridCols} items={tabItems} memo={newColsRef} weight={cardWeight} render={(it) => (
                    <FragmentCard
                      key={it.id}
                      it={it}
                      fitLine={fitPhrase(it.size, fitBrain)}
                      bagged={baggedIds.has(it.id)}
                      onOpen={() => openModal(it)}
                      onFavorite={() => react(it, "favorite")}
                    onPass={() => react(it, "skip")}
                      onBag={() => addToBag(it)}
                    />
                  )} />
              )}
            </>
          )}
        </>

      {/* ---- First visit: buyer-history scan (always escapable) ---- */}
      {connectOpen && (
        <div className="overlay" onClick={dismissConnectSheet}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="mclose" onClick={useMoodboardInstead}>×</button>
            <h2>Your taste, pre-loaded<span style={{ color: "var(--red)" }}>.</span></h2>
            <p className="deck">
              coming soon: connect an authorized source account and import only
              the data you permit to help shape your feed.
            </p>
            <div className="connectrow">
              {PLATFORMS.map((p) => (
                <button key={p} className="platform soon" disabled={!!connecting} onClick={() => connect(p)}>
                  {connecting === p ? "checking setup…" : p}
                </button>
              ))}
            </div>
            {connectNote && <p className="deck" style={{ color: "var(--red)" }}>{connectNote}</p>}
            <div className="orline">OR</div>
            <p className="deck">
              start cold: favorite what you love, build a moodboard, and follow
              boards whose taste you trust — the feed learns from all of it.
            </p>
            <button className="btn wide" onClick={useMoodboardInstead}>
              start with the moodboard + following
            </button>
          </div>
        </div>
      )}

      {/* ---- Item detail: ALL the depth lives here ---- */}
      {modal && (
        <div className="overlay" onClick={dismissItemModal}>
          {/* A real dialog (launch audit, Aug 16): it announced as a plain div,
              so assistive tech had no way to know a layer had opened, what it
              was called, or that the page behind it was inert. `×` alone is not
              an accessible name either. Escape already closed it — that part
              was right. aria-labelledby points at the piece's own title, which
              is the honest name for this dialog. */}
          <div
            ref={itemDialogRef}
            className="modal lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-detail-title"
            // -1 so the trap can land focus on the dialog itself if it ever
            // contains nothing focusable; it stays out of the tab sequence.
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {modalGlass}
            {/* the pane is the glass; this scrolls inside it (the gloss and the
                edge stay put) */}
            <div className="mscroll">
            <button className="mclose" aria-label="close item detail" onClick={() => setModal(null)}>×</button>
            {/* tap the photograph: it floats alone (FloatView). askTilt runs
                inside the tap — iOS answers the motion question only there. */}
            <button
              type="button"
              className="mimg"
              aria-label="see the photograph alone"
              onClick={async () => {
                const src = modal.img || thumbFor(modal);
                const aspect = aspectFor(modal.id);
                const tilt = await askTilt();
                setFloat({ src, aspect, tilt });
              }}
            >
              <img
                src={modal.img || thumbFor(modal)}
                alt=""
                style={{ aspectRatio: aspectFor(modal.id) }}
              />
            </button>
            <div className="mbody">
              <h2 className="ttl" id="item-detail-title">{modal.title}</h2>
              <a
                className="brand2"
                href={"/discover?q=" + encodeURIComponent(modal.brand)}
                title={"see " + modal.brand + " on DISCOVER"}
              >
                {modal.brand}
              </a>
              <div className="meta">
                {modal.category ? <span className="cat">{modal.category}</span> : null}
                {eraLabel(modal.era) ? <span className="era">{eraLabel(modal.era)}</span> : null}
              </div>
              <ColorEvidenceLine item={modal} detailed />
              {/* THE SAME PHOTOGRAPH, ELSEWHERE. No button asked for this and
                  none exists — it arrives with the pieces that were already
                  being fetched. Absent when the photograph is unique, which is
                  the ordinary case. lib/vision/sameShot.js */}
              {modalSameShot && (
                <div className="shotline">
                  <span aria-hidden="true">◦</span> {modalSameShot.note}
                  <span className="shotline-row">
                    {modalSameShot.listings.map((l) => (
                      <a key={l.id} className="shotline-go"
                         href={"/?item=" + encodeURIComponent(l.id)}>
                        {l.currency && l.price != null ? `${l.currency} ${l.price}` : "see it"}
                        {l.saving ? <b> · {l.currency || ""} {l.saving} less</b> : null}
                      </a>
                    ))}
                  </span>
                </div>
              )}
              {/* WHAT WE COULD SEE. Never a verdict, never a score, and never
                  the words authentic or fake — lib/authenticity/evidence.js.
                  Absent entirely on a cheap piece; the coverage line appears
                  only where a reader is about to pay for a claim, because
                  there withholding it would hide a consequence. */}
              {modalEvidence && (
                <div className="sawline">
                  {modalEvidence.observations.map((o) => (
                    <div className="sawline-said" key={o.id}>
                      <span aria-hidden="true">·</span> {o.said}
                    </div>
                  ))}
                  <div className="sawline-cover">
                    {modalEvidence.checked} of {modalEvidence.total} checks could run
                    {modalEvidence.notChecked.length > 0 && (
                      <span className="sawline-gap">
                        {" — "}
                        {modalEvidence.notChecked.map((n) => n.needs).join("; ")}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <OriginLine item={modal} detailed />
              {(modal.size?.label || fitPhrase(modal.size, fitBrain)) ? (
                <div className="size">
                  {modal.size?.label ? <span className="szlabel">{modal.size.label}</span> : null}
                  {fitPhrase(modal.size, fitBrain) ? (
                    <span className="szfit">{fitPhrase(modal.size, fitBrain)}</span>
                  ) : null}
                </div>
              ) : null}
              {modal.designers && modal.designers.length ? (
                <div className="designers">
                  {modal.designers.map((d) => (
                    <a
                      className="dz"
                      key={d}
                      href={"/discover?q=" + encodeURIComponent(d)}
                      title={"see " + d + " on DISCOVER"}
                    >
                      {d}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="pricerow">
                {modal.price ? <span className="price">{modal.currency || "USD"} {modal.price}</span> : null}
                {/* DEMO MODE: no purchase control on a record the server will
                    refuse anyway (tickets/route.js answers 409 for seed
                    inventory). Offering it and failing on click is how the
                    launch audit found this. The price stays visible because it
                    is part of the sample record, but the row says what it is. */}
                {isDemoItem(modal) ? (
                  <span className="demoflag">{DEMO_NOTE}</span>
                ) : isGhostItem(modal) ? (
                  <>
                    <span className="demoflag">{GHOST_NOTE}</span>
                    {safeExternalUrl(modal.url) ? (
                      <a className="buy" href={safeExternalUrl(modal.url)} target="_blank" rel="noopener noreferrer">view source ↗</a>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button className="buy" style={{ background: "none", border: 0, cursor: "pointer", padding: 0, font: "inherit" }}
                      onClick={() => setTicketItem(modal)}>request purchase</button>
                    {safeExternalUrl(modal.url) ? (
                      <a className="buy" href={safeExternalUrl(modal.url)} target="_blank" rel="noopener noreferrer">view source ↗</a>
                    ) : null}
                  </>
                )}
              </div>
              {reasonFor(modal) ? <div className="why">{reasonFor(modal)}</div> : null}
              <AsteriskWhy item={modal} onNotice={setNotice} />
              <div className="tags">
                {Object.keys(modal.tags || {}).slice(0, 4).map((t) => (
                  <span className="t" key={t}>
                    {t}
                    {/* The tooltip used to promise "less <tag>", which the
                        code never delivered — see muteTag. It now describes
                        the signal actually sent. */}
                    <button className="mute" title="show me less like this piece" onClick={() => muteTag(modal)}>×</button>
                  </span>
                ))}
              </div>
              <div className="actions">
                {modal.purchasable && !isGhostItem(modal) && (
                  <button className="buybtn" onClick={() => startPurchase(modal)}>Buy ↗</button>
                )}
                <button onClick={() => react(modal, "favorite")}>Favorite</button>
                <button className={baggedIds.has(modal.id) ? "on" : ""} onClick={() => addToBag(modal)}>
                  {baggedIds.has(modal.id) ? "In bag ✓" : "Add to bag"}
                </button>
                <button className={savedIds.has(modal.id) ? "on" : ""} onClick={() => saveToBoard(modal)}>
                  {savedIds.has(modal.id) ? "Saved ✓" : "Save"}
                </button>
                <button onClick={() => react(modal, "skip")}>Skip</button>
              </div>
              <div className="actions2">
                <button onClick={() => shareItem(modal)}>share ↗</button>
                <button onClick={() => { moreLikeThis(modal); setModal(null); }}>more like this</button>
                <button onClick={() => { window.location.href = "/stylist?anchor=" + encodeURIComponent(modal.id); }}>
                  style it ✂
                </button>
                <button onClick={() => {
                  const on = !followedBrands().includes(modal.brand);
                  setFollowBrand(modal.brand, on);
                  setNotice(on ? `following ${modal.brand} — their pieces land in your FOLLOWING tab` : `unfollowed ${modal.brand}`);
                }}>
                  {followedBrands().includes(modal.brand) ? "following brand ✓" : "follow brand"}
                </button>
              </div>
              {modalRel.length ? (
                <div className="mrelwrap">
                  <div className="mrelhead">goes with</div>
                  <div className="mrel">
                    {modalRel.map((r) => (
                      <button key={r.id} className="mrelitem" onClick={() => openModal(r)}>
                        <img src={r.img || thumbFor(r)} alt={r.title} />
                        <span>{r.brand}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </div>
      )}
      {float && (
        <FloatView src={float.src} aspect={float.aspect} tilt={float.tilt} onClose={() => setFloat(null)} />
      )}

      {ticketItem && <TicketFlow item={ticketItem} onClose={() => setTicketItem(null)} />}
    </div>
  );
}

// One masonry cell: the minimal listing card. (The synthetic community post
// tiles that used to smoosh in after every 7th card are gone — Aug 12,
// owner order: the catalog is pieces of clothing only; real posts live on
// the POST sub-page.)
// How many columns the catalog grid shows. The old multicol rule was
// `columns: <cols> <min width>` — at most --ed-grid-cols columns, each at
// least --ed-grid-colw wide — so a narrow desktop window dropped to fewer
// columns. The same contract, computed: the UI lab's variables (it announces
// a change as `asilum:edition`), the grid's own width, two on a phone.
function useColumnCount() {
  const [count, setCount] = useState(4);
  useEffect(() => {
    // The same breakpoint as the stylesheet's mobile rules (globals.css).
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      if (mq.matches) { setCount(2); return; }
      const css = getComputedStyle(document.documentElement);
      const cols = parseInt(css.getPropertyValue("--ed-grid-cols"), 10);
      const colw = parseInt(css.getPropertyValue("--ed-grid-colw"), 10);
      const gap = parseInt(css.getPropertyValue("--ed-grid-gap"), 10);
      const want = Number.isFinite(cols) && cols > 0 ? cols : 4;
      const minW = Number.isFinite(colw) && colw > 0 ? colw : 240;
      const g = Number.isFinite(gap) && gap >= 0 ? gap : 20;
      const grid = document.querySelector(".grid.gcols");
      const width = grid ? grid.clientWidth : window.innerWidth;
      const fit = Math.max(1, Math.floor((width + g) / (minW + g)));
      setCount(Math.max(1, Math.min(want, fit)));
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("asilum:edition", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("asilum:edition", sync);
    };
  }, []);
  return count;
}

// Explicit columns with a memory: a card keeps the column it was first
// placed in, a newcomer takes the shortest, and cards keep list order within
// a column — so a replacement lands where the replaced card stood and a
// removal (PASS) shortens only its own column (lib/feed/rechunk.js
// placeInColumns; see .grid.gcols in globals.css).
// `memo` is the page's map for this list (it must outlive a tab round-trip,
// or every card re-buckets when the reader comes back); `weight` says how tall
// a card is so columns balance by height.
function Columns({ items, count, render, children, memo, weight }) {
  const n = Math.max(1, count);
  const fallbackRef = useRef({ count: n, map: new Map() });
  const store = memo || fallbackRef;
  if (store.current.count !== n) store.current = { count: n, map: new Map() };
  const cols = placeInColumns(items, n, store.current.map, weight);
  return (
    <div className="grid gcols">
      {cols.map((col, c) => <div className="gcol" key={c}>{col.map(render)}</div>)}
      {children}
    </div>
  );
}

function FragmentCard({ it, fitLine, bagged, onOpen, onFavorite, onBag, onPass }) {
  return (
    <div className={"card" + (it._zone === "reach" ? " reach" : "")} data-id={it.id}>
      {/* ONE ACCESSIBLE NAME PER CARD (launch audit, Aug 16). The image and the
          title were both bare divs with onClick — the detail opened for a
          mouse and was unreachable from a keyboard, while the accessibility
          page claimed "full keyboard operability of navigation and controls".
          The title is now the real control; the image is presentational and
          keeps its pointer affordance, so a screen reader announces the piece
          once rather than twice. */}
      <div className="imgwrap" onClick={onOpen} aria-hidden="true" style={{ aspectRatio: aspectFor(it.id) }}>
        <OriginSticker item={it} />
        <img src={it.img || thumbFor(it)} alt="" loading="lazy" />
      </div>
      <div className="body">
        <button type="button" className="ttl" onClick={onOpen}>{it.title}</button>
        {/* A demo record says so, and says nothing else about provenance: no
            source, no "just in". Both would be claims it cannot support. */}
        {isDemoItem(it)
          ? <div className="fitline demoflag"><b>{DEMO_LABEL}</b> · sample data, not for sale</div>
          : isGhostItem(it)
            ? <div className="fitline demoflag"><b>{GHOST_LABEL}</b> · read by asterisk · lives at its source</div>
            : it.src ? <div className="fitline"><b className="red">{it.src}</b> · just in</div> : null}
        {it.price ? <div className="price">{it.currency || "USD"} {it.price}</div> : null}
        <ColorEvidenceLine item={it} />
        <OriginLine item={it} />
        {fitLine ? <div className="fitline">{fitLine}</div> : null}
        <div className="cardacts">
          <button onClick={onFavorite}>Favorite</button>
          {/* (7 Sep) the brief's third verb — a reader can pass on a piece
              without opening it. Same signal the modal's Skip sends. */}
          {onPass && <button className="pass" onClick={onPass}>Pass</button>}
          <button className={bagged ? "on" : ""} onClick={onBag}>
            {bagged ? "In bag ✓" : "Add to bag"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Asterisk AI — "why this" panel (Day 11). Fetches the honest explanation for
// the open item and offers structured corrections that actually train the
// profile (negative codes feed avoided tags; wrong-* codes file data reports).
const ASTERISK_CORRECTION_CHIPS = [
  ["not-my-style", "not my style"],
  ["less-like-this", "less like this"],
  ["more-like-this", "more like this"],
  ["wrong-color", "wrong color"],
  ["already-own", "already own"],
];

function AsteriskWhy({ item, onNotice }) {
  const [why, setWhy] = useState(null);
  const [sent, setSent] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setWhy(null);
    setSent(null);
    authorizedFetch(
      "/api/why?item=" + encodeURIComponent(item.id) + "&user=" + encodeURIComponent(getUid() || ""),
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.explanation) setWhy(d.explanation); })
      .catch(() => {});
    return () => controller.abort();
  }, [item.id]);

  async function correct(code) {
    setSent(code);
    try {
      const response = await postJSON("/api/why", { user: getUid(), productId: item.id, code });
      if (!response.ok) throw new Error("correction rejected");
      const result = await response.json();
      if (onNotice) onNotice(result.duplicate
        ? "already noted — no duplicate signal was added"
        : result.profileUpdated === false
          ? "saved — your feed adjusted; stylist profile refresh is pending"
          : code === "more-like-this"
            ? "noted — asterisk leans in"
            : code.startsWith("wrong")
              ? "reported — a moderator will check this listing"
              : "noted — asterisk adjusts your profile");
    } catch {
      setSent(null);
      if (onNotice) onNotice("correction could not be saved — try again");
    }
  }
  if (!why) return null;
  return (
    <div className="awhy">
      <div className="awhyhead"><b className="red">*</b> ASTERISK — WHY THIS</div>
      <div className="awhysum">
        {why.summary}
        {/* A BAND, NOT A PERCENTAGE — constitution A5. "taste match 62%" is a
            number invented from a dot product over ten hand-weighted
            aesthetics; the second decimal is not knowledge. confidenceBand()
            was written to say the true amount and had never been rendered. */}
        {why.tasteMatch > 0 ? " · " + confidenceBand(why.tasteMatch) : ""}
      </div>
      {(why.warnings || []).map((w) => <div className="awhywarn" key={w}>{w}</div>)}
      {why.uncertainty ? <div className="awhywarn">{why.uncertainty}</div> : null}
      <div className="awhychips">
        {ASTERISK_CORRECTION_CHIPS.map(([code, label]) => (
          <button key={code} className={"achip" + (sent === code ? " on" : "")}
            disabled={!!sent} onClick={() => correct(code)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
