"use client";

// app/components/dismiss.js — ONE dismissal contract for transient surfaces
// (synergy phase 1). Every overlay/sheet/modal closes on Escape; panels that
// float without an overlay (bag, Asterisk drawer) also close on a click
// outside — excluding their own toggle button, so the toggle still toggles.

import { useEffect, useRef } from "react";

// Overlay click-away, hardened for assistive tech (found by ear, 20 Aug,
// during the claim-12 VoiceOver pass): AT activation can fire a DUPLICATED
// click at the trigger's screen position, and once the overlay is up that
// ghost click lands on it — instantly dismissing what just opened. Two
// guards: the click must land on the overlay ITSELF (not a child, so inner
// surfaces no longer need their own stopPropagation to survive), and not
// within the overlay's first 400ms of life. `active` is the overlay's open
// condition — the birth clock resets each time it opens.
export function useOverlayDismiss(onClose, active = true) {
  const bornRef = useRef(0);
  useEffect(() => {
    if (active) bornRef.current = Date.now();
  }, [active]);
  return (event) => {
    if (event.target !== event.currentTarget) return;
    if (Date.now() - bornRef.current < 400) return;
    onClose();
  };
}

export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

// A dialog that declares `aria-modal="true"` is telling assistive technology
// that everything behind it is inert. That has to be MADE true — the attribute
// does not do it. Without a trap, a keyboard user who opens the item detail
// keeps focus on the trigger BEHIND the layer, tabs into the page behind it,
// and can operate a catalog they cannot see.
//
// So: move focus in on open, cycle Tab inside, and put focus back where it came
// from on close. Escape still closes (useEscape) — this does not add a trap a
// user cannot leave, which would be WCAG 2.1.2.
const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap(surfaceRef, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const surface = surfaceRef.current;
    if (!surface) return undefined;

    // Where focus came from, so it can be given back. Restoring focus is the
    // half people forget: without it, closing a dialog drops the user at the
    // top of the document and they lose their place entirely.
    const origin = document.activeElement;
    const inside = () =>
      [...surface.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    (inside()[0] || surface).focus();

    const onKey = (event) => {
      if (event.key !== "Tab") return;
      const items = inside();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!surface.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase: the surface's own handlers must not swallow Tab first.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (origin && origin.isConnected && typeof origin.focus === "function") origin.focus();
    };
  }, [active, surfaceRef]);
}

export function useClickAway(surfaceRef, onClose, { active = true, excludeRef = null } = {}) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (event) => {
      const surface = surfaceRef.current;
      if (!surface || surface.contains(event.target)) return;
      if (excludeRef?.current && excludeRef.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active, onClose, surfaceRef, excludeRef]);
}
