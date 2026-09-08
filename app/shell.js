"use client";

// app/shell.js
// The magazine shell around every page: one fixed top header — wordmark at
// full size, the always-moving ticker, big search/bag/sign-in — with the
// seven destinations in a row directly under it (owner order, Aug 12: the
// left sidebar is gone). Account controls live on PROFILE so identity has
// one obvious home.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  thumbFor, bagList, bagRemove, clearFitProfile, getUid, setUid, brainEnabled,
  authorizedFetch, SIGN_OUT_NOTICE,
} from "../lib/client.js";
import {
  searchUsers, sourceFor, followedBrands, followedUsers,
} from "../lib/social.js";
import { getSupabase } from "../lib/supabase.js";
import { Avatar, FollowButton } from "./components/UserBits.jsx";
import { ColorEvidenceLine, OriginLine, ProductFitLine, useFitBrain } from "./components/ProductSignals.jsx";
import { AsteriskGuidanceToggle } from "./components/AsteriskMemory.jsx";
import ConsentMoment from "./components/ConsentMoment.jsx";
import { useClickAway, useEscape } from "./components/dismiss.js";
import AccountSignup from "./components/AccountSignup.jsx";
import DesignConsole from "./components/DesignConsole.jsx";
import Notice from "./components/Notice.jsx";
import MailDesk from "./components/MailDesk.jsx";
import { DEFAULT_KIND } from "../lib/accounts.js";
import { navFor } from "../lib/nav.js";

// Seven destinations — the complete mental model of the OS. Every legacy
// route stays reachable: STYLIST rides under DISCOVER, ORDERS under PROFILE,
// STATS/UPLOAD under PASSPORT, and the brain/control-room pages highlight
// their parent subsystem.


// What the ticker carries when the account follows nothing yet (owner order,
// 17 Aug). It used to advertise the machinery — "THE TASTE ENGINE IS LIVE —
// SIX BRIDGES, ONE FEED" — which is both a product claim and a public mention
// of the learning bridges. These are the house lines instead. The spacing in
// "A S I L U M" is the owner's and is deliberate; do not close it up.
const TICKER_PLACEHOLDERS = [
  "ARE YOU SEEKING A S I L U M",
  "DISCOVERY - COMMERCE - COMMUNITY",
  "DISCOVER FROM ARCHIVES ACROSS THE WORLD",
];
const TICKER = TICKER_PLACEHOLDERS.join(" — ") + " — ";

// LIQUID GLASS, the optics. Only Chromium runs an SVG filter as a
// backdrop-filter (WebKit parses it and paints nothing; Gecko drops it), so
// the refraction is gated on the engine, not on CSS.supports — which is true
// everywhere and proves nothing.
function canRefract() {
  if (typeof window === "undefined") return false;
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands)) return brands.some((b) => /chromium/i.test(b.brand || ""));
  return !!window.chrome; // Chrome, Edge, Brave, Arc, Opera — all Blink
}

// The displacement map: a picture of how far each pixel of the backdrop is
// pulled, red for x and green for y, 128 meaning none, blue held at 128 so
// the still middle is a pure grey. A SECOND, greyscale picture carries how
// much of the pane is bezel (the lens ring) rather than frost. Two pictures,
// not one: Chromium colour-manages a feImage into the display's space, and
// on a P3 screen a pixel of (128,128,0) comes back with blue near 0.2 — a
// weight carried in one colour channel next to two others leaked a ghost of
// the sharp lens through the whole frosted middle. Greys survive the
// conversion; only greys are trusted here. The bezel is the
// outer BEZEL px of the rounded rect (measured by a rounded-rect signed
// distance); its profile is Apple's squircle, y = (1 - (1 - t)^4)^(1/4), and
// the bend per point is Snell's law for glass (n = 1.5) on that slope,
// pointing INWARD along the surface normal so no pixel ever samples beyond
// the pane (Chromium's backdrop stops at the pane's edge). The very lip is
// eased to nothing so the edge itself stays clean, the way Apple's does.
const BEZEL = 24;
const GLASS_N = 1.5;
function bendProfile(t) {
  // t: 0 at the edge, 1 at the inner end of the bezel
  if (t <= 0 || t >= 1) return 0;
  const u = 1 - t;
  const slope = (u * u * u) / Math.pow(1 - u * u * u * u, 0.75); // dy/dt of the squircle
  const theta = Math.atan(slope);
  const delta = theta - Math.asin(Math.sin(theta) / GLASS_N);
  const lip = Math.min(1, t / 0.12); // ease in over the outer 12% of the bezel
  return Math.tan(delta) * lip;
}
function drawRefractionMap(node, weightNode, w, h, radius) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const cw = document.createElement("canvas");
  cw.width = w; cw.height = h;
  const ctxw = cw.getContext("2d");
  if (!ctx || !ctxw) return;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const imgw = ctxw.createImageData(w, h);
  const dw = imgw.data;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const hx = w / 2, hy = h / 2;
  // normalise the profile so the strongest bend uses the full channel
  let peak = 0;
  for (let i = 1; i < 200; i++) peak = Math.max(peak, bendProfile(i / 200));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx, py = y + 0.5 - hy;
      const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
      let nx = 0, ny = 0, inside; // outward normal, distance to the edge
      // rounded-rect signed distance: q is the offset past the corner
      // centres; in the corner both are positive (radial), on a side one is
      // (that side), inside neither (the nearer side, the larger q)
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        nx = (qx / len) * Math.sign(px); ny = (qy / len) * Math.sign(py);
        inside = r - len;
      } else if (qx > qy) {
        nx = Math.sign(px); inside = r - qx;
      } else {
        ny = Math.sign(py); inside = r - qy;
      }
      let m = 0;
      if (inside >= 0 && inside < BEZEL) m = bendProfile(inside / BEZEL) / (peak || 1);
      // the bezel's weight: 1 at the lip, easing to 0 a little past the bend
      const bw = Math.max(0, Math.min(1, 1 - inside / (BEZEL * 1.35)));
      const i = (y * w + x) * 4;
      d[i] = Math.round(128 - nx * m * 127);      // pull inward along -normal
      d[i + 1] = Math.round(128 - ny * m * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
      const wt = Math.round(255 * bw * bw * (3 - 2 * bw)); // smoothstep, as a grey
      dw[i] = wt; dw[i + 1] = wt; dw[i + 2] = wt; dw[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxw.putImageData(imgw, 0, 0);
  node.setAttribute("href", c.toDataURL("image/png"));
  weightNode.setAttribute("href", cw.toDataURL("image/png"));
}

export default function Shell({ children }) {
  const fit = useFitBrain();
  const pathname = usePathname();
  const router = useRouter();
  const [bag, setBag] = useState([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagHow, setBagHow] = useState(false);
  // LIQUID GLASS (owner order, 8 Sep, fourth pass — "exactly like Apple's").
  // Three things live here, all as CSS variables and attributes so nothing
  // re-renders:
  //   1. the pane deepens once the page scrolls under it (data-glass="deep");
  //   2. the REFRACTION — Chromium can run an SVG filter as a backdrop-filter,
  //      so the pane's outer bezel bends what scrolls beneath it through a
  //      displacement map drawn here from the pane's own size and corner
  //      radius (squircle bezel + Snell's law; R = x shift, G = y shift, 128 =
  //      none). Other engines keep the blur and never see the attribute;
  //   3. the LAMPS — .glass-light is a sibling UNDER the pane, kept to the
  //      pane's rect, carrying the current destination's coloured glow, the
  //      hovered word's glow (it glides between words) and the pointer's
  //      shine. The pane blurs and bends that light: a glow stick in water.
  // Reduced motion keeps pane, lamps and refraction; only the gliding stops
  // (globals.css) and the pointer shine is dropped.
  const headRef = useRef(null);
  const lightRef = useRef(null);
  const mapRef = useRef(null);
  const weightRef = useRef(null);
  const placeCurrentRef = useRef(null);
  useEffect(() => {
    const el = headRef.current;
    const light = lightRef.current;
    if (!el || !light) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => { el.dataset.glass = window.scrollY > 24 ? "deep" : ""; };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // where a word sits, as a percentage of the pane
    const centreOf = (node) => {
      const r = el.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      return {
        x: `${((b.left + b.width / 2 - r.left) / Math.max(1, r.width)) * 100}%`,
        y: `${((b.top + b.height / 2 - r.top) / Math.max(1, r.height)) * 100}%`,
      };
    };
    const placeCurrent = () => {
      const cur = el.querySelector(".snav.cur");
      if (!cur) { light.style.setProperty("--cs", "0"); return; }
      const c = centreOf(cur);
      light.style.setProperty("--cx", c.x);
      light.style.setProperty("--cy", c.y);
      light.style.setProperty("--cs", "1");
    };
    placeCurrentRef.current = placeCurrent;

    // the lamp layer follows the pane's rect; the refraction map is redrawn
    // for the pane's size (Chromium only — see canRefract)
    const refract = canRefract();
    let raf = 0;
    const fit = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      light.style.top = `${r.top}px`;
      light.style.left = `${r.left}px`;
      light.style.width = `${r.width}px`;
      light.style.height = `${r.height}px`;
      if (refract && mapRef.current && weightRef.current && r.width > 0 && r.height > 0) {
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        drawRefractionMap(mapRef.current, weightRef.current, Math.round(r.width), Math.round(r.height), radius);
        el.dataset.refract = "1";
      }
      placeCurrent();
    };
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(fit); });
    ro.observe(el);
    fit();

    // the hovered word's lamp glides to it; the wordmark lights red
    let lit = null;
    const onOver = (e) => {
      const word = e.target.closest && e.target.closest("a, button");
      if (!word || !el.contains(word) || word === lit) return;
      lit = word;
      const c = centreOf(word);
      // the lamp sits under the pane; the pane's bezel reflects it, so both
      // carry the word's place and colour
      for (const n of [el, light]) {
        n.dataset.lamp = word.classList.contains("wordmark") ? "red" : "";
        n.style.setProperty("--lx", c.x);
        n.style.setProperty("--ly", c.y);
        n.style.setProperty("--ls", "1");
      }
    };
    const onOut = (e) => {
      const to = e.relatedTarget;
      if (to && to.closest && to.closest("a, button") && el.contains(to)) return;
      lit = null;
      for (const n of [el, light]) n.style.setProperty("--ls", "0");
    };
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerout", onOut);

    // the pointer's shine, on the pane and in the water beneath it
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = `${((e.clientX - r.left) / Math.max(1, r.width)) * 100}%`;
      const y = `${((e.clientY - r.top) / Math.max(1, r.height)) * 100}%`;
      for (const n of [el, light]) {
        n.style.setProperty("--gx", x);
        n.style.setProperty("--gy", y);
        n.style.setProperty("--gs", "1");
      }
    };
    const onLeave = () => { el.style.setProperty("--gs", "0"); light.style.setProperty("--gs", "0"); };
    if (!still) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointerover", onOver);
      el.removeEventListener("pointerout", onOut);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      placeCurrentRef.current = null;
    };
  }, []);
  // the current destination moved: move its lamp
  useEffect(() => { placeCurrentRef.current?.(); }, [pathname]);
  const bagPanelRef = useRef(null);
  const bagToggleRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [guideOn, setGuideOn] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [follows, setFollows] = useState({ brands: [], users: [] });
  const [authUser, setAuthUser] = useState(null);
  const debounceRef = useRef(null);
  const searchRequestRef = useRef({ id: 0, controller: null });
  const pendingAdoptionRef = useRef(null);
  const deviceIdentityRef = useRef(null);

  useEffect(() => {
    // Landing law (owner order, 19 Aug): on DESKTOP the terminal opens on
    // the FRONT COVER — the magazine leads; mobile opens straight to the
    // rack (CATALOG). This lives in the SHELL because the shell mounts
    // exactly once per hard entry and persists across soft navs (the page
    // mounts in a later Suspense commit, so a page-level check loses the
    // race to this stamp — measured, not assumed). Only a true entry
    // landing on "/" redirects: the sessionStorage stamp survives
    // refreshes mid-visit, in-app CATALOG clicks never re-run this effect,
    // and deep links (?item=, ?board=, any query) never bounce.
    // replace(), not push — back must leave the site, not loop.
    try {
      const entered = window.sessionStorage.getItem("asilum-entered");
      window.sessionStorage.setItem("asilum-entered", "1");
      if (!entered && pathname === "/" && !window.location.search) {
        // innerWidth reads 0 while a restoring/backgrounded tab has no
        // layout yet (measured here, not assumed) — a zero must defer the
        // desktop/mobile call, never decide it. Bounded frames; if layout
        // never reports, mobile's answer (stay on the rack) is the safe one.
        let frames = 0;
        const decide = () => {
          const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
          if (!width && frames++ < 60) { window.requestAnimationFrame(decide); return; }
          if (width > 760) router.replace("/cover");
        };
        decide();
      }
    } catch {}
    // Clear the stale "connected" flag from the old simulated import — no
    // real connection exists until a real OAuth adapter ships.
    try { window.localStorage.removeItem("asilum-connected"); } catch {}
    const sync = () => setBag(bagList());
    const syncFollows = () => setFollows({ brands: followedBrands(), users: followedUsers() });
    sync();
    syncFollows();
    window.addEventListener("asilum:bag", sync);
    window.addEventListener("asilum:follow", syncFollows);
    // Follows changed in another tab or before a stale render: re-sync.
    window.addEventListener("storage", syncFollows);
    window.addEventListener("focus", syncFollows);
    return () => {
      window.removeEventListener("asilum:bag", sync);
      window.removeEventListener("asilum:follow", syncFollows);
      window.removeEventListener("storage", syncFollows);
      window.removeEventListener("focus", syncFollows);
    };
  }, []);

  useEffect(() => {
    const syncGuide = () => setGuideOn(brainEnabled());
    syncGuide();
    window.addEventListener("asilum:brain", syncGuide);
    return () => window.removeEventListener("asilum:brain", syncGuide);
  }, []);

  // Theme follows the device unless the owner picked one in SETTINGS.
  // The pre-paint script (app/layout.js) resolves the first frame; this
  // listener keeps an un-pinned session in step with a live OS switch.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const followDevice = () => {
      let stored = null;
      try { stored = window.localStorage.getItem("asilum-theme"); } catch {}
      if (stored !== "dark" && stored !== "light") {
        document.documentElement.dataset.theme = mq.matches ? "light" : "dark";
      }
    };
    mq.addEventListener("change", followDevice);
    return () => mq.removeEventListener("change", followDevice);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchRequestRef.current.id++;
    searchRequestRef.current.controller?.abort();
  }, []);

  // One dismissal contract (synergy phase 1): Escape and click-away both
  // close the bag panel; the toggle button still toggles.
  useEscape(() => setBagOpen(false), bagOpen);
  useClickAway(bagPanelRef, () => setBagOpen(false), { active: bagOpen, excludeRef: bagToggleRef });

  // A search that is already open must be re-ranked immediately when the
  // switch changes; stale personalized results must never sit under OFF.
  useEffect(() => {
    if (searchOpen && q.trim()) onSearchInput(q);
  }, [guideOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- What kind of account is reading this? ----
  // Held in state rather than read per-render: the nav must not flicker from
  // passport to business on every navigation. It starts at the default and
  // corrects itself once, which means a business briefly sees passport tabs on
  // a cold load — acceptable, because the ROUTE GUARD is server-side and the
  // tabs are only the invitation. A 503 (the store is unreadable) deliberately
  // leaves the last known kind in place instead of downgrading to passport.
  const [accountKind, setAccountKind] = useState(DEFAULT_KIND);
  useEffect(() => {
    let cancelled = false;
    async function readKind() {
      try {
        // A parked choice from the confirm-by-email path: the account did not
        // exist when it was made. Redeem it now that this device is signed in,
        // then clear it — otherwise someone who chose BUSINESS and confirmed
        // by email lands in a passport with no idea why.
        const uid = getUid();
        if (uid && uid.startsWith("sb-")) {
          let parked = null;
          try { parked = window.localStorage.getItem("asilum-pending-kind"); } catch {}
          if (parked) {
            try {
              const recorded = await authorizedFetch("/api/account/kind", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: parked, user: uid }),
              });
              // Clear only on a definite answer. A 409 means the account has
              // already chosen, which is also settled. A network failure keeps
              // the parked choice for the next load rather than losing it.
              if (recorded.ok || recorded.status === 409) {
                window.localStorage.removeItem("asilum-pending-kind");
              }
            } catch { /* keep it parked */ }
          }
        }
        const response = await authorizedFetch("/api/account/kind?user=" + encodeURIComponent(uid || ""), { cache: "no-store" });
        if (!response.ok) return; // includes 503 — hold what we have
        const data = await response.json();
        if (!cancelled && data?.kind) setAccountKind(data.kind);
      } catch { /* offline: hold what we have */ }
    }
    readKind();
    // Signing in changes which account is reading, and therefore the nav. The
    // first version asked once on mount, so a business that signed in kept the
    // passport tabs until a hard reload.
    const again = () => { readKind(); };
    window.addEventListener("asilum:account-kind", again);
    window.addEventListener("asilum:identity", again);
    return () => {
      cancelled = true;
      window.removeEventListener("asilum:account-kind", again);
      window.removeEventListener("asilum:identity", again);
    };
  }, []);
  const nav = navFor(accountKind);

  // ---- Server-issued device identity + Supabase magic-link auth. ----
  async function ensureDeviceIdentity() {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("device identity unavailable");
    const data = await response.json();
    if (!data || !/^u-[0-9a-f-]{36}$/.test(data.uid || "")) {
      throw new Error("invalid device identity");
    }
    return data.uid;
  }

  useEffect(() => {
    let active = true;
    let sub = null;
    const deviceIdentity = ensureDeviceIdentity().catch(() => null);
    deviceIdentityRef.current = deviceIdentity;
    const activateDevice = () => deviceIdentity.then((uid) => {
      if (active && uid) setUid(uid);
    });
    getSupabase().then((sb) => {
      if (!active) return;
      if (!sb) { activateDevice(); return; }
      const r = sb.auth.onAuthStateChange((event, session) => {
        if (active) setAuthUser(session?.user || null);
        if (event === "INITIAL_SESSION") {
          if (session) onSignedIn(session);
          else activateDevice();
        }
        if (event === "SIGNED_IN" && session) onSignedIn(session);
        if (event === "SIGNED_OUT") {
          pendingAdoptionRef.current = null;
          clearFitProfile();
          // WHAT WAS WRONG (Aug 7, Round A): this said "device taste remains".
          // It does not. Adoption MOVES taste — it deletes the device's profile
          // row, reassigns its boards, interactions, follows and wardrobe to the
          // account, and leaves the device identity at {} / [] / []. Measured
          // directly against the db layer. Signing out then resumes that same,
          // now-empty device id, so the old notice told the user their taste was
          // still here while the feed they got back was a cold start.
          //
          // The move itself is correct — copying instead would double-count the
          // same taste in aggregates and leave account-derived taste sitting on
          // a possibly shared device. So the message changes, not the behaviour.
          //
          // (Aug 8) The wording now lives in ONE place. app/profile/page.js has
          // its own SIGN OUT handler that publishes the same notice, and it
          // still carried the old false string — this fix landed in shell.js
          // only and never grepped for a second emitter. Both fire, so they
          // raced. Import the constant; do not retype it.
          setAuthNotice(SIGN_OUT_NOTICE);
          activateDevice();
        }
      });
      sub = r && r.data ? r.data.subscription : null;
    });
    return () => {
      active = false;
      pendingAdoptionRef.current = null;
      if (sub) sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adoption uses the HttpOnly device cookie as source proof. Keep subsequent
  // activity on the device identity until the one-time copy succeeds, so a
  // transient database failure cannot strand taste or corrections.
  async function onSignedIn(session) {
    const user = session.user;
    const account = "sb-" + user.id;
    const currentIdentity = getUid();
    if (currentIdentity === account) return;
    if (pendingAdoptionRef.current?.account === account) {
      return pendingAdoptionRef.current.promise;
    }
    if (currentIdentity?.startsWith("sb-")) clearFitProfile();

    const pending = { account, promise: null };
    pendingAdoptionRef.current = pending;
    pending.promise = (async () => {
      let adopted = false;
      try {
        const device = await (deviceIdentityRef.current || ensureDeviceIdentity());
        if (!device) throw new Error("device identity unavailable");
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ user: account }),
        });
        if (!response.ok) throw new Error("identity adoption failed");
        const adoption = await response.json();
        if (adoption.correctionProfileUpdated === false) {
          setAuthNotice("signed in — corrections moved; stylist profile refresh is pending");
        }
        adopted = true;
      } catch {
        if (pendingAdoptionRef.current === pending) {
          setAuthNotice("signed in, but this device's taste could not be adopted");
        }
      }
      // BEING SIGNED IN IS NOT CONTINGENT ON YOUR TASTE MOVING.
      //
      // `setUid(account)` used to sit behind `adopted`, so any failure of the
      // adoption POST left localStorage holding the old `u-` device id while
      // the Supabase session was perfectly valid. The reader was signed in and
      // the app did not know it.
      //
      // The visible cost was the mail desk. MailDesk gates on
      // `getUid().startsWith("sb-")` — correctly, since DMs are impossible for
      // a device identity under ADR-002 — so a failed adoption removed
      // MESSAGING ENTIRELY on that device, permanently, with nothing on screen
      // connecting the two. It presented as "DMs work on my phone but not my
      // laptop", because adoption is heavier on the device with more history
      // to move and fails there first.
      //
      // Two unrelated things were coupled: whether your taste TRANSFERRED
      // decided whether you could see your MESSAGES. Identity is who you are;
      // adoption is what moves with you. The first does not wait on the second.
      if (pendingAdoptionRef.current === pending) {
        setUid(account);
        // The adoption failure already has its own notice, set in the catch
        // above; only overwrite it when there is nothing to warn about.
        if (adopted) setAuthNotice(`signed in as ${user.email || user.id}`);
      }
    })();
    try { await pending.promise; } finally {
      if (pendingAdoptionRef.current === pending) pendingAdoptionRef.current = null;
    }
  }

  function setAuthNotice(message) {
    try {
      window.localStorage.setItem("asilum-auth-notice", message);
      window.dispatchEvent(new CustomEvent("asilum:auth-notice", { detail: message }));
    } catch {}
  }

  // ---- Multi-search: brands / pieces / aesthetics / users ----
  function onSearchInput(text) {
    setQ(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchRequestRef.current.id++;
    searchRequestRef.current.controller?.abort();
    searchRequestRef.current.controller = null;
    if (!text.trim()) { setResults(null); return; }
    const requestId = searchRequestRef.current.id;
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchRequestRef.current.controller = controller;
      try {
        const query = new URLSearchParams({
          q: text.trim(),
          user: getUid() || "",
          brain: guideOn ? "1" : "0",
        });
        const [searchResponse, suggestResponse] = await Promise.all([
          authorizedFetch("/api/search?" + query.toString(), { signal: controller.signal }),
          fetch("/api/suggest?q=" + encodeURIComponent(text.trim()), { signal: controller.signal }),
        ]);
        if (!searchResponse.ok) throw new Error("search unavailable");
        const [d, s] = await Promise.all([
          searchResponse.json(),
          suggestResponse.ok ? suggestResponse.json() : Promise.resolve({ suggestions: [] }),
        ]);
        if (requestId !== searchRequestRef.current.id) return;
        setResults({
          brands: Array.isArray(d.brands) ? d.brands : [],
          items: Array.isArray(d.items) ? d.items : [],
          aesthetics: Array.isArray(d.aesthetics) ? d.aesthetics : [],
          users: searchUsers(text).slice(0, 4),
          suggestions: Array.isArray(s.suggestions) ? s.suggestions : [],
          note: typeof d.note === "string" ? d.note : null,
        });
      } catch (error) {
        if (requestId === searchRequestRef.current.id && error?.name !== "AbortError") {
          setResults(null);
        }
      } finally {
        if (requestId === searchRequestRef.current.id) {
          searchRequestRef.current.controller = null;
        }
      }
    }, 220);
  }
  function submitSearch(e) {
    if (e.key !== "Enter" || !q.trim()) return;
    window.location.href = "/discover?q=" + encodeURIComponent(q.trim());
  }
  function closeSearch() {
    // Delayed so option mousedown handlers win over blur.
    setTimeout(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchRequestRef.current.id++;
      searchRequestRef.current.controller?.abort();
      searchRequestRef.current.controller = null;
      setSearchOpen(false);
      setResults(null);
      setQ("");
    }, 180);
  }

  // Bag is intent only; checkout, fees, and shipping belong to source sites.
  const subtotal = bag.reduce((s, x) => s + (x.price || 0), 0);
  const nSources = new Set(bag.map((x) => sourceFor(x))).size;

  // Ticker: the brands and people you follow, clickable — brands land on
  // DISCOVER pre-searched, people land on their page. Default copy until you
  // follow something.
  const tickerItems = [];
  for (const b of follows.brands) tickerItems.push({ label: b.toUpperCase(), href: "/discover?q=" + encodeURIComponent(b) });
  for (const h of follows.users) tickerItems.push({ label: h.toUpperCase(), href: "/u/" + encodeURIComponent(h) });
  const tickerRun = tickerItems.length ? (
    <>
      <a className="mqhome" href="/">*ASILUM MAGAZINE</a>
      {tickerItems.map((t, i) => (
        <a className="mqlink" key={t.label + i} href={t.href}> — {t.label}</a>
      ))}
      <span> — </span>
    </>
  ) : (
    <span>{TICKER}</span>
  );

  return (
    <div className="shell">
      {/* Keyboard/screen-reader users jump past the header.
          Visually hidden until focused — no visual-identity change. */}
      <a className="skiplink" href="#main">skip to content</a>
      <div className="os-blob b1" aria-hidden="true" />
      <div className="os-blob b2" aria-hidden="true" />
      <div className="os-blob b3" aria-hidden="true" />
      <div className="os-blob b4" aria-hidden="true" />
      {/* thin non-uniform hairlines + small outline squares slightly
          bordering the page (owner reference language, Aug 12) */}
      <div className="os-frame" aria-hidden="true"><i /><i /><i /><i /></div>

      {/* the lamps under the glass, then the glass (see the effect above) */}
      <div className="glass-light" ref={lightRef} aria-hidden="true" />
      <svg className="glass-defs" aria-hidden="true" focusable="false">
        {/* THE OPTICS: the centre of the pane is frosted (a deep blur); the
            bezel is a clear lens — the backdrop bent through the map, each
            colour a little differently (glass disperses: red bends least,
            blue most — the faint colour fringe on Apple's edges), only
            lightly softened — blended with the frost by the weight picture,
            a grey that says how much of each pixel is bezel. That is Apple's
            glass: a crisp refracting rim around a frosted middle. */}
        <filter id="lg-refract" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feImage ref={mapRef} preserveAspectRatio="none" result="lgmap" />
          <feImage ref={weightRef} preserveAspectRatio="none" result="lgw" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="frost" />
          <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="50" xChannelSelector="R" yChannelSelector="G" result="bentR" />
          <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="56" xChannelSelector="R" yChannelSelector="G" result="bentG" />
          <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="62" xChannelSelector="R" yChannelSelector="G" result="bentB" />
          <feColorMatrix in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
          <feColorMatrix in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
          <feColorMatrix in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
          <feComposite in="chR" in2="chG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="chRG" />
          <feComposite in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="bent" />
          <feGaussianBlur in="bent" stdDeviation="1.2" result="lens" />
          {/* lens × weight + frost × (1 − weight): the weight picture read
              into COLOUR at full alpha, and its complement, so the blend is
              plain arithmetic — no alpha mask, nothing premultiplied to
              darken the band. */}
          <feColorMatrix in="lgw" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="w" />
          <feColorMatrix in="lgw" type="matrix" values="-1 0 0 0 1  -1 0 0 0 1  -1 0 0 0 1  0 0 0 0 1" result="iw" />
          <feComposite in="lens" in2="w" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lensW" />
          <feComposite in="frost" in2="iw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="frostW" />
          <feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </svg>
      <header className="tophead" ref={headRef}>
        <div className="thbar">
          {/* MAGAZINE is justified to the exact width of ASILUM above it (owner
              order, 17 Aug) — one letter per span, spread by flex, so the line
              is flush at both ends at EVERY size instead of guessing at a
              letter-spacing that only lands at one font-size. See .wordmark em.
              aria-label pins the accessible name so splitting the word cannot
              make a screen reader spell it out. */}
          <a className="wordmark" href="/" title="back to the catalog"
             aria-label="*ASILUM magazine — back to the catalog">
            <i>*</i>ASILUM
            <em aria-hidden="true">
              {"MAGAZINE".split("").map((ch, i) => <span key={i}>{ch}</span>)}
            </em>
            {/* Split per CHARACTER, not per word. With three words and
                space-between you get two enormous gaps and tightly-set words —
                which is exactly what looked wrong. Spread every glyph instead
                and the letter gaps come out even, while the space character
                still carries its own width plus a gap either side, so the two
                words stay two words. NBSP because a plain space collapses. */}
            <small aria-hidden="true">
              {"FASHION TERMINAL".split("").map((ch, i) => (
                <span key={i}>{ch === " " ? "\u00A0" : ch}</span>
              ))}
            </small>
          </a>
          <div className="marquee">
            <div className="mq">
              {tickerRun}
              {tickerRun}
            </div>
          </div>
          <div className="topright">
            {searchOpen ? (
              <>
                <input aria-label="ask for a piece, feeling, place, film or era"
                  autoFocus
                  className="search"
                  placeholder="ask for a piece, feeling, place, film, era…"
                  value={q}
                  onChange={(e) => onSearchInput(e.target.value)}
                  onKeyDown={submitSearch}
                  onBlur={closeSearch}
                />
                <AsteriskGuidanceToggle className="fitbtn asearchtoggle" />
              </>
            ) : (
              <button className="tbtn" onClick={() => setSearchOpen(true)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.7" cy="6.7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="10.2" y1="10.2" x2="14.4" y2="14.4" stroke="currentColor" strokeWidth="1.6" /></svg>
                SEARCH
              </button>
            )}
            <button ref={bagToggleRef} className="tbtn" onClick={() => setBagOpen((o) => !o)}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 5h10.8l-.9 9H3.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5.4 5V4a2.6 2.6 0 0 1 5.2 0v1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              BAG ({bag.length})
            </button>
            {authUser ? (
              // Signed in: the corner button becomes the profile circle
              // (owner order, Aug 13) — initial from the account email.
              <a className="tbtn tbav" href="/profile" title={authUser.email || authUser.id} aria-label="your profile — signed in">
                <span className="tbavatar">{String(authUser.email || "•").slice(0, 1).toUpperCase()}</span>
              </a>
            ) : (
              <button
                className="tbtn"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "signin" } }))
                }
              >
                SIGN IN
              </button>
            )}
          </div>
        </div>
        {/* The destination row carries the destinations, and at its RIGHT END
            the mail desk — the place the owner marked on the screenshot. The
            Asterisk guide chip that rode the left end and the compact orb that
            rode the right end are both gone; the guide lives whole at
            /asterisk and the orb still holds /stats and /upload.

            The desk renders nothing at all when messaging is off or the reader
            is signed out — absent, not disabled — so for everyone else the row
            is exactly the seven destinations. */}
        <nav className="topnav">
          <div className="snavs">
            {nav.map((n) => {
              const cur = n.match(pathname || "/");
              return (
                <span className="snavwrap" key={n.href}>
                  <a className={"snav" + (cur ? " cur" : "")} href={n.href}>
                    <span className="nic" aria-hidden="true">{n.icon}</span>
                    {n.label}
                    <span className="nled" aria-hidden="true" />
                    <span className="nmeta">{n.meta}</span>
                  </a>
                  {cur && n.sub && (
                    <span className="snavsub">
                      {n.sub.map((s) => (
                        <a key={s.href} className={pathname?.startsWith(s.href) ? "cur" : ""} href={s.href}>{s.label}</a>
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <MailDesk />
        </nav>
      </header>

      <AccountSignup />
      <DesignConsole />

      {searchOpen && results && (
        <div className="searchpanel">
          <div className={"searchguide " + (guideOn ? "on" : "off")}>
            <b className="red">*</b> ASTERISK {guideOn ? "IS GUIDING" : "IS PAUSED"}
            <span>{guideOn ? " · ordered through your Passport" : " · general results"}</span>
          </div>
          {results.note && (
            <div className="searchnote">
              <b className="red">*</b> {results.note}
            </div>
          )}
          {(results.suggestions || []).length > 0 && (
            <>
              <div className="psub">SUGGESTIONS</div>
              {results.suggestions.slice(0, 6).map((s) => (
                <a className="shit" key={s.label} href={"/discover?q=" + encodeURIComponent(s.label)}>
                  {s.label}
                  <em style={{ marginLeft: 8 }}>{s.why === "did you mean" ? "did you mean" : s.kind}</em>
                </a>
              ))}
            </>
          )}
          {results.brands.length > 0 && (
            <>
              <div className="psub">BRANDS</div>
              {results.brands.map((b) => (
                <a className="shit" key={b} href={"/discover?q=" + encodeURIComponent(b)}>{b}</a>
              ))}
            </>
          )}
          {results.items.length > 0 && (
            <>
              <div className="psub">PIECES</div>
              {results.items.map((it) => (
                <a className="shit item" key={it.id} href={"/?item=" + encodeURIComponent(it.id)}>
                  <img src={it.img || thumbFor(it)} alt="" />
                  <span>{it.title}</span>
                  <em>{it.src}{it.price ? ` · ${it.currency || "USD"} ${it.price}` : ""}</em>
                  <ColorEvidenceLine item={it} />
                  <OriginLine item={it} />
                  <ProductFitLine item={it} fit={fit} />
                </a>
              ))}
            </>
          )}
          {results.aesthetics.length > 0 && (
            <>
              <div className="psub">AESTHETICS</div>
              {results.aesthetics.map((t) => (
                <a className="shit" key={t} href={"/discover?q=" + encodeURIComponent(t.toLowerCase())}>{t}</a>
              ))}
            </>
          )}
          {results.users.length > 0 && (
            <>
              <div className="psub">USERS</div>
              {results.users.map((u) => (
                <div className="urow" key={u.handle}>
                  <Avatar name={u.name} />
                  <div className="uinfo">
                    <div className="uname">{u.name}</div>
                    <div className="uhandle">{u.handle}</div>
                  </div>
                  <FollowButton handle={u.handle} />
                </div>
              ))}
            </>
          )}
          {!results.brands.length && !results.items.length && !results.aesthetics.length && !results.users.length && (
            <div className="pempty">nothing in the archive for that — press enter to search the full racks on DISCOVER.</div>
          )}
        </div>
      )}

      {bagOpen && (
        <div ref={bagPanelRef} className="panel bagpanel">
          <div className="phead">BAG</div>
          {bag.length === 0 ? (
            <div className="pempty">
              Bag empty<br />
              <span style={{ fontSize: 12 }}>The brain notices what you carry.</span>
            </div>
          ) : (
            <>
              {bag.map((x) => (
                <div className="bagrow" key={x.id}>
                  <img src={x.img || thumbFor(x)} alt="" />
                  <div className="baginfo">
                    <div className="bagttl">{x.title}</div>
                    <div className="bagprice">{sourceFor(x)} · {x.currency || "USD"} {x.price}</div>
                    <ColorEvidenceLine item={x} />
                    <OriginLine item={x} />
                    <ProductFitLine item={x} fit={fit} />
                  </div>
                  <button className="bagx" onClick={() => bagRemove(x.id)}>×</button>
                </div>
              ))}
              <div className="bagfees">
                <div><span>SUBTOTAL</span><b>USD {Math.round(subtotal)}</b></div>
                <div><span>SOURCES</span><b>{nSources}</b></div>
                <div className="bagfinal"><span>CHECKOUT</span><b>ON SOURCE SITES</b></div>
              </div>
              <button className="btn ghost wide" onClick={() => setBagHow((v) => !v)}>
                HOW PURCHASES WORK
              </button>
              {bagHow && (
                <Notice onDismiss={() => setBagHow(false)}>
                  ASILUM does not charge or ship. Open a piece to view its
                  source or create a purchase request.
                </Notice>
              )}
            </>
          )}
          <a className="btn ghost wide" href="/orders" style={{ display: "block", textAlign: "center" }}>
            VIEW ORDERS & TICKETS →
          </a>
        </div>
      )}

      <main id="main" className="main">{children}</main>

      <ConsentMoment />

      <OsStatus bagCount={bag.length} guideOn={guideOn} pathname={pathname || "/"} />
      <div className="os-crt" aria-hidden="true"><div className="os-roll" /></div>
    </div>
  );
}

/* ---- OS chrome components (redesign/os-shell) ---- */

// Live clock + honest readouts. Everything shown is real client state:
// the route, the bag count, whether ASTERISK guidance is on.
function OsStatus({ bagCount, guideOn, pathname }) {
  const [now, setNow] = useState("");
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setNow(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <footer className="os-status" aria-label="system status">
      <div className="st">
        <span className={"os-rec" + (guideOn ? "" : " off")} />
        <b>{guideOn ? "ASTERISK GUIDING" : "ASTERISK PAUSED"}</b>
      </div>
      <div className="st">ROUTE <b>{pathname}</b></div>
      <div className="st">BAG <b>{bagCount}</b></div>
      <div className="st"><span className="os-clock" suppressHydrationWarning>{now}</span></div>
    </footer>
  );
}

