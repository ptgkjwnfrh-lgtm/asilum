"use client";

// app/page.js — HOME.
// The big feed: Pinterest masonry (different-sized listings, community posts
// smooshed between them) with a Grailed-white editorial skin. Cards stay
// minimal — name, price, fit estimate, FAVORITE / ADD TO BAG — everything else
// lives in the detail view. First visit offers a buyer-history scan via a
// connected account; otherwise the moodboard + following jump-start applies.
// The brain underneath is unchanged: dwell, skips, zones, graph, rotation.

import { useEffect, useState, useCallback, useRef } from "react";
import Notice from "./components/Notice.jsx";
import { useEscape } from "./components/dismiss.js";
import { fitPhrase } from "../lib/brain/sizing.js";
import {
  getUid, postJSON, authorizedFetch, thumbFor, hashStr, bagAdd, safeExternalUrl,
  fitProfileForBrain, brainEnabled, claimRequest, watchRequest,
} from "../lib/client.js";
import {
  addPost, getProfileInfo, observationOn, followedUsers, followedBrands,
  setFollowBrand, STORIES, listPosts, timeAgo, DEMO_SOCIAL_ENABLED,
} from "../lib/social.js";
import { Avatar, WhoToFollowList } from "./components/UserBits.jsx";
import TicketFlow from "./components/TicketFlow.jsx";
import { ColorEvidenceLine, useFitProfile } from "./components/ProductSignals.jsx";

const DWELL_FLUSH_MS = 5000;
const DWELL_MIN_MS = 2000;
const MAX_RENDERED = 300;
const POST_EVERY = 7; // one community post per N listings

const CATEGORIES = ["tops", "bottoms", "outerwear", "tailoring", "dresses", "knitwear", "footwear", "accessories"];
const PLATFORMS = ["ebay", "pinterest", "shopify"];
const ASPECTS = ["3 / 4", "1 / 1", "4 / 5", "2 / 3", "3 / 4", "5 / 6"];

const BRIDGE_REASON = {
  alpha: "matches your taste",
  beta: "leans into a trait you love",
  gamma: "connected to pieces you saved",
  delta: "trending on asilum",
  epsilon: "a wildcard for you",
  ad: "sponsored",
};

// Community voices woven into the masonry (Pinterest's "people" texture).
const HANDLES = ["@arc.hive", "@vex.wears", "@tabi.lord", "@grey.market", "@hem.line", "@spine.press"];
const QUOTES = [
  "the collar is doing all the work and it knows it.",
  "bought one size up. living inside it now.",
  "this is what the archive smells like.",
  "wore it to a funeral and a gallery opening. both correct.",
  "the drape argues with gravity and wins.",
  "found the exact one from the runway. hands shaking.",
  "it photographs badly and looks incredible. keep it.",
  "my tailor refused to touch it. respect.",
];

function reasonFor(item) {
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

function aspectFor(id) {
  return ASPECTS[hashStr(id) % ASPECTS.length];
}

// ---- Collapsed cube: header always visible, body pops out on hover/click ----
function Collapsible({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"module col" + (open ? " open" : "")}>
      <button className="modhead colhead" onClick={() => setOpen((o) => !o)}>
        {title} <i>{open ? "−" : "+"}</i>
      </button>
      <div className="modbody">{children}</div>
    </div>
  );
}

// ---- Morse ticker: spells the brands you follow, full-width --------------
// Red * = dot, black bar = dash, cycling brand by brand.
const MORSE = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....",
  i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.",
  q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-",
  y: "-.--", z: "--..",
};
function morseSeq(word) {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  return letters.split("").flatMap((ch, i) =>
    [...(MORSE[ch] || "").split(""), ...(i < letters.length - 1 ? [" "] : [])]
  );
}

function FollowMorse() {
  const [words, setWords] = useState(["asilum"]);
  const morseRef = useRef(null);
  useEffect(() => {
    const sync = () => {
      const brands = followedBrands();
      setWords(brands.length ? brands : ["asilum"]);
    };
    sync();
    window.addEventListener("asilum:follow", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("asilum:follow", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  // Spell the followed brands back-to-back until the sequence is long enough
  // to fill the whole strip, then sweep left-to-right and start over.
  const base = words.flatMap((w) => [...morseSeq(w), " ", " ", " "]);
  const seqFull = [];
  while (seqFull.length < 160 && base.length) seqFull.push(...base);

  useEffect(() => {
    const root = morseRef.current;
    if (!root) return;
    const marks = Array.from(root.querySelectorAll("[data-morse-mark]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pos = 0;
    let visible = true;
    let iv = null;

    const stop = () => {
      if (iv) clearInterval(iv);
      iv = null;
    };
    const start = () => {
      if (iv || document.hidden || !visible || reducedMotion) return;
      iv = setInterval(() => {
        if (pos >= marks.length + 10) {
          marks.forEach((mark) => { mark.hidden = true; });
          pos = 0;
          return;
        }
        if (pos < marks.length) marks[pos].hidden = false;
        pos += 1;
      }, 130);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });

    if (reducedMotion) marks.forEach((mark) => { mark.hidden = false; });
    observer.observe(root);
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [seqFull.length]);

  return (
    <div ref={morseRef} className="morse" title={"spelling: " + words.join(", ")}>
      {seqFull.map((s, k) =>
        s === "." ? <span hidden data-morse-mark className="mstar" key={k}>*</span>
        : s === "-" ? <span hidden data-morse-mark className="mdash" key={k} />
        : <span hidden data-morse-mark className="mgap" key={k} />
      )}
      <span className="mcursor" />
    </div>
  );
}

// ---- The slide: rotates a stylist look / editorial story / far-reach piece ---
function Slide({ items, onOpenItem }) {
  const [look, setLook] = useState(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    authorizedFetch("/api/outfits?user=" + encodeURIComponent(getUid() || "guest") + "&n=1")
      .then((r) => r.json())
      .then((d) => setLook((d.outfits || [])[0] || null))
      .catch(() => {});
    const iv = setInterval(() => setIdx((i) => i + 1), 8000);
    return () => clearInterval(iv);
  }, []);
  const reach = items.find((it) => it._zone === "reach");
  const slides = [];
  if (look) slides.push({ type: "LOOK OF THE MOMENT", body: (
    <a href="/stylist" className="slidelook">
      <span className="slidethumbs">
        {look.items.slice(0, 3).map((it) => <img key={it.id} src={it.img || thumbFor(it)} alt="" />)}
      </span>
      <span>{look.dominantTag} · {look.conf} match · USD {Math.round(look.total || 0)} →</span>
    </a>
  )});
  slides.push({ type: "FROM THE MAGAZINE", body: (
    <a href="/hotlist" className="slidestory">
      <b>{STORIES[idx % STORIES.length].pub}</b> — {STORIES[idx % STORIES.length].title} →
    </a>
  )});
  if (reach) slides.push({ type: "A FAR REACH", body: (
    <button className="slidereach" onClick={() => onOpenItem(reach)}>
      <img src={reach.img || thumbFor(reach)} alt="" />
      <span>{reach.title} — break your pattern →</span>
    </button>
  )});
  const s = slides[idx % slides.length];
  return (
    <>
      <div className="psub" style={{ margin: "0 0 8px" }}>{s.type}</div>
      {s.body}
    </>
  );
}

// ---- Live observation tracker ------------------------------------------------
// A subtle sign the taste engine is alive: cycles observed-signal lines built
// from the user's actual strongest aesthetics. Gated by the on-device
// observation toggle in Settings.
function ObservationTracker() {
  const [lines, setLines] = useState(["ARCHIVAL", "MINIMAL", "STREETWEAR"]);
  const [idx, setIdx] = useState(0);
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(observationOn());
    authorizedFetch("/api/profile?user=" + encodeURIComponent(getUid() || "guest"))
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile || {};
        const w = { ...(p.long || {}) };
        for (const k in p.session || {}) w[k] = (w[k] || 0) + p.session[k];
        const top = Object.entries(w).filter(([, v]) => v > 0.05)
          .sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
        if (top.length >= 2) setLines(top);
      })
      .catch(() => {});
    const iv = setInterval(() => setIdx((i) => i + 1), 5200);
    return () => clearInterval(iv);
  }, []);

  if (!on) {
    return <div className="obsline dim">on-device observation is off — enable it in settings</div>;
  }
  return (
    <>
      {lines.slice(0, 5).map((tag, i) => (
        <div className={"obsline" + (i === idx % lines.length ? "" : " past")} key={tag + i}>
          <span className="pulse" />
          observed interest in <b>{tag}</b> on an external tab
        </div>
      ))}
      <div className="obsnote">signals stay on this device where possible.</div>
    </>
  );
}

export default function Home() {
  const [epsilon, setEpsilon] = useState(false);
  const [epsilonAuto, setEpsilonAuto] = useState(false);
  const [split, setSplit] = useState(null);
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
  const [modalRel, setModalRel] = useState([]);
  // One dismissal contract (synergy phase 1): Escape closes the open surface.
  useEscape(() => setModal(null), !!modal);
  useEscape(() => { markOnboarded(); setConnectOpen(false); }, connectOpen);
  const [ticketItem, setTicketItem] = useState(null);
  const [tab, setTab] = useState("curated");       // curated | following | new
  const [tabItems, setTabItems] = useState(null);  // following / what's-new items
  const [composer, setComposer] = useState("");
  const promptRef = useRef("");
  const boardParamRef = useRef("");
  const uidRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const feedGenRef = useRef(0);
  const sentinelRef = useRef(null);

  const fitBrain = fitProfileForBrain(fit);

  // ---- Dwell tracking ----
  const dwellRef = useRef({ vis: new Map(), sent: new Set() });
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    const sync = () => setGuideOn(brainEnabled());
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
        } else if (rec.start != null) {
          rec.total += now - rec.start;
          rec.start = null;
        }
        d.vis.set(id, rec);
      }
    }, { threshold: 0.55 });
    document.querySelectorAll(".card[data-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
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
        postJSON("/api/interaction", { user, events }).catch(() => {});
      }
    }, DWELL_FLUSH_MS);
    return () => clearInterval(iv);
  }, []);

  // ---- Feed ----
  const feedQS = useCallback((user) => {
    const qs = new URLSearchParams({ user, epsilon: epsilon ? "1" : "0", q: promptRef.current });
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
    try {
      const res = await authorizedFetch("/api/feed?" + feedQS(user).toString());
      const data = await res.json();
      if (!isCurrent()) return;
      setSplit(data.split || null);
      setItems(data.items || []);
      setEpsilonAuto(!!data.epsilonAuto);
      if (data.boardSeeded) setNotice("feed seeded from a moodboard you follow or opened");
      else if (data.craving) setNotice("current craving applied — your long-term taste was not rewritten");
      dwellRef.current = { vis: new Map(), sent: new Set() };
    } catch (e) {
      console.error(e);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [feedQS]);

  function applyCraving() {
    setTab("curated");
    setCraving({ ...cravingDraft, text: cravingDraft.text.trim().slice(0, 240) });
  }

  function clearCraving() {
    const empty = { text: "", occasion: "", mood: "", novelty: "discovery" };
    setCravingDraft(empty);
    setCraving(empty);
  }

  const loadMore = useCallback(async () => {
    const user = uidRef.current;
    if (!user || loadingMoreRef.current) return;
    if (itemsRef.current.length === 0 || itemsRef.current.length >= MAX_RENDERED) return;
    loadingMoreRef.current = true;
    // Appends observe the feed generation without claiming it: a page fetched
    // for a feed that has since reloaded must be dropped, not appended.
    const isCurrent = watchRequest(feedGenRef);
    try {
      const res = await authorizedFetch("/api/feed?" + feedQS(user).toString());
      const data = await res.json();
      if (!isCurrent()) return;
      if (data.items && data.items.length) {
        setItems((prev) => {
          const have = new Set(prev.map((x) => x.id));
          return [...prev, ...data.items.filter((x) => !have.has(x.id))];
        });
      }
    } catch (e) { console.error(e); }
    finally { loadingMoreRef.current = false; }
  }, [feedQS]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "700px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

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
        setNotice(`Asterisk is routing this edit toward “${q}” without rewriting your Passport`);
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

  useEffect(() => {
    if (uidRef.current) loadFeed();
  }, [filters, epsilon, craving, guideOn]); // eslint-disable-line react-hooks/exhaustive-deps

  function markOnboarded() {
    try {
      window.localStorage.setItem("asilum-onboarded", "1");
      // The account popup waits behind the first-visit sheet; let it know.
      window.dispatchEvent(new CustomEvent("asilum:onboarded"));
    } catch {}
  }

  // ---- Home tabs ----
  // Following: pieces from brands you follow + boards you follow + posts from
  // people you follow. What's New: the freshest inventory across the
  // affiliated sites, source-labeled.
  const [tabPosts, setTabPosts] = useState([]);
  async function switchTab(next) {
    setTab(next);
    if (next === "curated") return;
    setTabItems(null);
    setTabPosts([]);
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
          .then((r) => r.json());
        const follows = (prof.profile && prof.profile._meta && prof.profile._meta.follows) || [];
        const boards = await Promise.all(
          follows.map((id) => fetch("/api/boards?id=" + encodeURIComponent(id)).then((r) => r.json()).catch(() => null))
        );
        for (const b of boards) {
          for (const it of (b && b.board && b.board.items) || []) {
            if (!seen.has(it.id)) { seen.add(it.id); pool.push(it); }
          }
        }
        // posts from followed people
        const fu = new Set(followedUsers());
        setTabPosts(listPosts().filter((p) => fu.has(p.handle)));
        setTabItems(pool);
      }
    } catch { setTabItems([]); }
  }

  function publishPost() {
    if (!composer.trim()) return;
    const info = getProfileInfo();
    addPost(composer.trim(), info);
    // Real editorial_posts record too — localStorage stays the instant-render
    // path, the database is the durable one.
    postJSON("/api/editorial", { user: getUid(), handle: info.handle || info.name, text: composer.trim() }).catch(() => {});
    setComposer("");
    setNotice("posted — it's live on the community tab of EDITORIAL and on your profile");
  }

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
  function insertRelatedAfter(afterId, newItems, cap = 4) {
    setItems((prev) => {
      const have = new Set(prev.map((x) => x.id));
      const add = newItems.filter((x) => !have.has(x.id)).slice(0, cap);
      if (!add.length) return prev;
      const idx = prev.findIndex((x) => x.id === afterId);
      const out = prev.slice();
      out.splice(idx + 1, 0, ...add);
      return out;
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
      await postJSON("/api/interaction", { user: uidRef.current, item, action, dwellMs });
      if (action === "favorite") moreLikeThis(item);
    } catch (e) { console.error(e); }
  }

  function addToBag(item) {
    bagAdd(item);
    setBaggedIds((prev) => new Set(prev).add(item.id));
    react(item, "bag");
  }

  async function muteTag(tag) {
    const synthetic = { id: "mute:" + tag + ":" + Date.now(), tags: { [tag]: 1 } };
    try {
      await postJSON("/api/interaction", { user: uidRef.current, item: synthetic, action: "skip" });
      setModal(null);
      loadFeed();
    } catch (e) { console.error(e); }
  }

  async function saveToBoard(item) {
    setSavedIds((prev) => new Set(prev).add(item.id));
    try {
      await postJSON("/api/boards", { user: uidRef.current, item });
    } catch (e) { console.error(e); }
  }

  async function shareItem(item) {
    const url = window.location.origin + "/?item=" + encodeURIComponent(item.id);
    try { await navigator.clipboard.writeText(url); setNotice("item link copied — it carries its taste graph"); } catch {}
    postJSON("/api/interaction", { user: uidRef.current, item, action: "share", dwellMs: dwellMsFor(item.id) }).catch(() => {});
  }

  function openModal(item) {
    setModal(item);
    setModalRel([]);
    fetch("/api/related?item=" + encodeURIComponent(item.id) + "&limit=6")
      .then((r) => r.json())
      .then((d) => setModalRel(d.items || []))
      .catch(() => {});
  }

  // Community post tile content, deterministic per feed position. The quote
  // index steps by 3 (+ a small per-item offset) per post slot so neighboring
  // posts can never repeat.
  function postFor(item, idx) {
    const h = hashStr(item.id + ":" + idx);
    const ord = Math.floor((idx + 1) / POST_EVERY);
    return {
      quote: QUOTES[(ord * 3 + (h % 3)) % QUOTES.length],
      handle: HANDLES[(h >> 4) % HANDLES.length],
      ctx: "on the " + item.brand,
    };
  }

  const splitLabels = split ? <FollowMorse /> : null;

  return (
    <div className="wrap">
      <h1 className="headline"><span className="red">*</span>THE FEED</h1>
      <p className="deck">
        {guideOn
          ? "Asterisk routed this edit through your Passport — six bridges, three zones, no reruns."
          : "Asterisk is paused — this is a general edit. Your Passport is still waiting when you return."}
      </p>

      <div className="tabs">
        {[["curated", "CURATED"], ["following", "FOLLOWING"], ["new", "WHAT'S NEW"]].map(([k, label]) => (
          <button key={k} className={"tab" + (tab === k ? " cur" : "")} onClick={() => switchTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="composer2">
        <Avatar name={getProfileInfo().name} />
        <div className="cright">
          <textarea
            rows={2}
            maxLength={400}
            placeholder="what are you wearing?"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
          />
          <div className="cbar">
            <span className="cicons">
              <button title="image — soon" onClick={() => setNotice("image posts arrive with the vibe reader")}>▣</button>
              <button title="tag a piece — soon" onClick={() => setNotice("piece-tagging is on the cutting table")}>#</button>
            </span>
            <span className="ccount">{composer.length}/400</span>
            <button className="btn" disabled={!composer.trim()} onClick={publishPost}>POST</button>
          </div>
        </div>
      </div>

      <div className="homeband">
        <Collapsible title="LIVE OBSERVATION">
          <ObservationTracker />
        </Collapsible>
        <Collapsible title="WHO TO FOLLOW">
          <WhoToFollowList compact withSearch />
        </Collapsible>
        <Collapsible title="THE SLIDE">
          <Slide items={items} onOpenItem={openModal} />
        </Collapsible>
      </div>

      <section className="cravingbox" aria-labelledby="craving-title">
        <div className="cravinghead">
          <div>
            <div className="psub" id="craving-title">CURRENT CRAVING</div>
            <p className="deck">tell the tollbooth what this moment needs. it steers this feed without changing your permanent taste.</p>
          </div>
          {craving.text || craving.occasion || craving.mood || craving.novelty !== "discovery" ? (
            <button className="fitbtn" onClick={clearCraving}>CLEAR</button>
          ) : null}
        </div>
        <div className="cravinggrid">
          <input
            type="text"
            maxLength={240}
            placeholder="dark dinner look, clean but strange, airport armor…"
            value={cravingDraft.text}
            onChange={(e) => setCravingDraft((c) => ({ ...c, text: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && applyCraving()}
          />
          <select value={cravingDraft.occasion} onChange={(e) => setCravingDraft((c) => ({ ...c, occasion: e.target.value }))}>
            <option value="">any occasion</option>
            <option value="everyday">everyday</option><option value="work">work</option>
            <option value="date">date</option><option value="night">night</option>
            <option value="event">event</option><option value="travel">travel</option>
            <option value="outdoors">outdoors</option>
          </select>
          <select value={cravingDraft.mood} onChange={(e) => setCravingDraft((c) => ({ ...c, mood: e.target.value }))}>
            <option value="">any mood</option>
            <option value="quiet">quiet</option><option value="sharp">sharp</option>
            <option value="romantic">romantic</option><option value="experimental">experimental</option>
            <option value="nostalgic">nostalgic</option><option value="practical">practical</option>
          </select>
          <select value={cravingDraft.novelty} onChange={(e) => setCravingDraft((c) => ({ ...c, novelty: e.target.value }))}>
            <option value="safe">safe bet</option><option value="discovery">discovery</option>
            <option value="wildcard">wildcard</option>
          </select>
          <button className="btn" onClick={applyCraving}>POINT THE WAY</button>
        </div>
      </section>

      <div className="filters">
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">all categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
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

      <div className="splitbar">{splitLabels}</div>

      {notice && <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {epsilonAuto && (
        <Notice variant="banner">trying something different — you seemed in a rut</Notice>
      )}

      {tab === "curated" && (
        <>
          {loading && <div className="empty">thinking…</div>}
          {!loading && items.length === 0 && (
            <div className="empty">Nothing matches — loosen the filters or search a mood.</div>
          )}
          <div className="grid">
            {items.map((it, i) => {
              const fitLine = fitPhrase(it.size, fitBrain);
              const post = DEMO_SOCIAL_ENABLED && (i + 1) % POST_EVERY === 0 ? postFor(it, i) : null;
              return (
                <FragmentCard
                  key={it.id}
                  it={it}
                  fitLine={fitLine}
                  bagged={baggedIds.has(it.id)}
                  onOpen={() => openModal(it)}
                  onFavorite={() => react(it, "favorite")}
                  onBag={() => addToBag(it)}
                  post={post}
                />
              );
            })}
          </div>
          <div ref={sentinelRef} className="sentinel" />
        </>
      )}

      {tab === "following" && (
        <>
          {!tabItems && <div className="empty">reading who and what you follow…</div>}
          {tabPosts.length > 0 && tabPosts.map((p) => (
            <div className="cpost" key={p.id}>
              <Avatar name={p.name} />
              <div className="cbody">
                <div className="chead">
                  <span className="uname">{p.name}</span>
                  <span className="uhandle">{p.handle} · {timeAgo(p.at)}</span>
                </div>
                <p className="ctext">{p.text}</p>
              </div>
            </div>
          ))}
          {tabItems && tabItems.length === 0 && tabPosts.length === 0 && (
            <div className="empty">
              nothing here yet — follow brands (from any piece), moodboards
              (open a shared board and hit FOLLOW), and people
              ({followedUsers().length} followed so far) to build this tab.
            </div>
          )}
          {tabItems && tabItems.length > 0 && (
            <div className="grid">
              {tabItems.map((it) => (
                <FragmentCard
                  key={it.id}
                  it={it}
                  fitLine={fitPhrase(it.size, fitBrain)}
                  bagged={baggedIds.has(it.id)}
                  onOpen={() => openModal(it)}
                  onFavorite={() => react(it, "favorite")}
                  onBag={() => addToBag(it)}
                  post={null}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "new" && (
        <>
          <p className="deck">just in from the affiliated sites — freshest first.</p>
          {!tabItems && <div className="empty">pulling the fresh racks…</div>}
          {tabItems && (
            <div className="grid">
              {tabItems.map((it) => (
                <FragmentCard
                  key={it.id}
                  it={it}
                  fitLine={fitPhrase(it.size, fitBrain)}
                  bagged={baggedIds.has(it.id)}
                  onOpen={() => openModal(it)}
                  onFavorite={() => react(it, "favorite")}
                  onBag={() => addToBag(it)}
                  post={null}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- First visit: buyer-history scan (always escapable) ---- */}
      {connectOpen && (
        <div className="overlay" onClick={useMoodboardInstead}>
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
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="mclose" onClick={() => setModal(null)}>×</button>
            <div className="mimg">
              <img
                src={modal.img || thumbFor(modal)}
                alt={modal.alt || modal.title}
                style={{ aspectRatio: aspectFor(modal.id) }}
              />
            </div>
            <div className="mbody">
              <div className="ttl">{modal.title}</div>
              <div
                className="brand2"
                style={{ cursor: "pointer" }}
                title={"see " + modal.brand + " on DISCOVER"}
                onClick={() => { window.location.href = "/discover?q=" + encodeURIComponent(modal.brand); }}
              >
                {modal.brand}
              </div>
              <div className="meta">
                {modal.category ? <span className="cat">{modal.category}</span> : null}
                {eraLabel(modal.era) ? <span className="era">{eraLabel(modal.era)}</span> : null}
              </div>
              <ColorEvidenceLine item={modal} detailed />
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
                    <span
                      className="dz"
                      key={d}
                      style={{ cursor: "pointer" }}
                      title={"see " + d + " on DISCOVER"}
                      onClick={() => { window.location.href = "/discover?q=" + encodeURIComponent(d); }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="pricerow">
                {modal.price ? <span className="price">{modal.currency || "USD"} {modal.price}</span> : null}
                <button className="buy" style={{ background: "none", border: 0, cursor: "pointer", padding: 0, font: "inherit" }}
                  onClick={() => setTicketItem(modal)}>request purchase</button>
                {safeExternalUrl(modal.url) ? (
                  <a className="buy" href={safeExternalUrl(modal.url)} target="_blank" rel="noopener noreferrer">view source ↗</a>
                ) : null}
              </div>
              {reasonFor(modal) ? <div className="why">{reasonFor(modal)}</div> : null}
              <AsteriskWhy item={modal} onNotice={setNotice} />
              <div className="tags">
                {Object.keys(modal.tags || {}).slice(0, 4).map((t) => (
                  <span className="t" key={t}>
                    {t}
                    <button className="mute" title={"less " + t} onClick={() => muteTag(t)}>×</button>
                  </span>
                ))}
              </div>
              <div className="actions">
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
      )}

      {ticketItem && <TicketFlow item={ticketItem} onClose={() => setTicketItem(null)} />}
    </div>
  );
}

// One masonry cell: the minimal listing card, plus (sometimes) a community
// post tile smooshed in after it.
function FragmentCard({ it, fitLine, bagged, onOpen, onFavorite, onBag, post }) {
  return (
    <>
      <div className={"card" + (it._zone === "reach" ? " reach" : "")} data-id={it.id}>
        <div className="imgwrap" onClick={onOpen} style={{ aspectRatio: aspectFor(it.id) }}>
          <img src={it.img || thumbFor(it)} alt={it.alt || it.title} loading="lazy" />
        </div>
        <div className="body">
          <div className="ttl" onClick={onOpen}>{it.title}</div>
          {it.src ? <div className="fitline"><b className="red">{it.src}</b> · just in</div> : null}
          {it.price ? <div className="price">{it.currency || "USD"} {it.price}</div> : null}
          <ColorEvidenceLine item={it} />
          {fitLine ? <div className="fitline">{fitLine}</div> : null}
          <div className="cardacts">
            <button onClick={onFavorite}>Favorite</button>
            <button className={bagged ? "on" : ""} onClick={onBag}>
              {bagged ? "In bag ✓" : "Add to bag"}
            </button>
          </div>
        </div>
      </div>
      {post ? (
        <div className="post">
          <div className="quote">“{post.quote}”</div>
          <div className="handle">{post.handle}</div>
          <div className="ctx">{post.ctx}</div>
        </div>
      ) : null}
    </>
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
        {why.tasteMatch > 0 ? " · taste match " + Math.round(why.tasteMatch * 100) + "%" : ""}
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
