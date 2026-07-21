"use client";

// app/components/dismiss.js — ONE dismissal contract for transient surfaces
// (synergy phase 1). Every overlay/sheet/modal closes on Escape; panels that
// float without an overlay (bag, Asterisk drawer) also close on a click
// outside — excluding their own toggle button, so the toggle still toggles.

import { useEffect } from "react";

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
