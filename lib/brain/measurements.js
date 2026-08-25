// lib/brain/measurements.js — a person's body, in four shapes.
//
// This module exists because the same five numbers travel through the app in
// FOUR different representations, and mixing them up is the bug this file is
// written to prevent — a 40-inch chest read as 40cm, or a stored centimetre
// value shown back as inches.
//
//   INPUT    what the form sends: strings, in whatever unit the person picked.
//   STORAGE  what the database holds: ALWAYS INCHES, never the display unit.
//            `{ usualSize, preferredUnit, inches }` — preferredUnit records
//            what to SHOW, and never what is stored.
//   DISPLAY  storage converted back into the person's unit, for the form.
//   BRAIN    inches, uppercased usual size, zero and empty values dropped.
//
// THE ONE RULE: inches on the way in, inches in the database, conversion only
// at the display edge. `preferredUnit` is a presentation preference. If you
// ever find a centimetre value in `storage.inches`, something skipped
// normalizeMeasurementProfile — that function is the only correct door in.
//
// Nothing here touches a database or a request; callers pass the profile.
// Measurements are FIRST-PARTY ONLY and never leave for an external service.

import { FIT_LADDER } from "./sizing.js";

/** The five measurements, in the order they are shown. */
export const MEASUREMENT_KEYS = ["chest", "waist", "hips", "inseam", "height"];
/** A blank DISPLAY profile — the shape the form binds to, not the stored one. */
export const EMPTY_MEASUREMENTS = {
  usualSize: "", unit: "in", chest: "", waist: "", hips: "", inseam: "", height: "",
};

/**
 * Has this person told us anything about their body?
 *
 * True if a usual size OR any positive measurement is present, so someone who
 * gave only "M" still counts. Used to decide whether to ASK, never to gate
 * what they can see.
 */
export function hasMeasurementProfile(profile = {}) {
  if (String(profile?.usualSize || "").trim()) return true;
  return MEASUREMENT_KEYS.some((key) => {
    const value = Number(profile?.[key]);
    return Number.isFinite(value) && value > 0;
  });
}

const INCH_RANGES = {
  chest: [20, 100], waist: [18, 100], hips: [20, 100], inseam: [15, 60], height: [36, 96],
};
const round = (value) => +value.toFixed(2);

/**
 * INPUT -> STORAGE. The only correct way measurements enter the system.
 *
 * Converts to inches, range-checks every value, and returns
 * `{ ok: true, storage }` or `{ ok: false, error }` — it never throws and
 * never partially accepts, so a caller cannot half-save a profile.
 *
 * The ranges reject impossibilities rather than unusual bodies, and they are
 * checked AFTER conversion, so "180" in centimetres passes as a height while
 * "180" in inches does not. An empty string means "not given" and is stored as
 * null, which is different from zero.
 *
 * Refuses a profile that is entirely blank: storing nothing under a person's
 * name is worse than asking again.
 */
export function normalizeMeasurementProfile(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "measurement profile must be an object" };
  }
  const unit = input.unit === "cm" ? "cm" : "in";
  const usualSize = String(input.usualSize || "").trim().toUpperCase();
  if (usualSize && !FIT_LADDER.includes(usualSize)) return { ok: false, error: "invalid usual size" };
  const inches = {};
  for (const key of MEASUREMENT_KEYS) {
    if (input[key] === "" || input[key] == null) { inches[key] = null; continue; }
    const value = Number(input[key]);
    if (!Number.isFinite(value)) return { ok: false, error: `${key} must be a number` };
    const converted = unit === "cm" ? value / 2.54 : value;
    const [min, max] = INCH_RANGES[key];
    if (converted < min || converted > max) return { ok: false, error: `${key} is outside the supported range` };
    inches[key] = round(converted);
  }
  if (!usualSize && !MEASUREMENT_KEYS.some((key) => inches[key] != null)) {
    return { ok: false, error: "add a usual size or at least one measurement" };
  }
  return { ok: true, storage: { usualSize: usualSize || null, preferredUnit: unit, inches } };
}

/**
 * STORAGE -> DISPLAY. Inches back into whichever unit the person chose.
 *
 * Missing values become "" rather than 0, because an empty field and a
 * measurement of zero are different statements and a form must not turn the
 * first into the second.
 */
export function measurementProfileForDisplay(storage = {}) {
  const unit = storage.preferredUnit === "cm" ? "cm" : "in";
  const inches = storage.inches || {};
  const profile = { ...EMPTY_MEASUREMENTS, usualSize: storage.usualSize || "", unit };
  for (const key of MEASUREMENT_KEYS) {
    const value = Number(inches[key]);
    profile[key] = Number.isFinite(value) ? round(unit === "cm" ? value * 2.54 : value) : "";
  }
  return profile;
}

/**
 * DISPLAY -> BRAIN. What the fit engine in sizing.js consumes.
 *
 * Note this takes a DISPLAY profile (with `unit`), not a storage record (with
 * `preferredUnit`) — the two look almost identical and convert in opposite
 * directions. Non-positive and unparseable values are dropped entirely rather
 * than passed through as zero, so the engine sees absent facts as absent.
 */
export function measurementProfileForBrain(profile = {}) {
  const unit = profile.unit === "cm" ? "cm" : "in";
  const measurements = {};
  for (const key of MEASUREMENT_KEYS) {
    const value = Number(profile[key]);
    if (Number.isFinite(value) && value > 0) measurements[key] = round(unit === "cm" ? value / 2.54 : value);
  }
  return { usualSize: String(profile.usualSize || "").toUpperCase(), measurements };
}

/**
 * Switch a DISPLAY profile between inches and centimetres.
 *
 * Purely for the form's unit toggle — the stored record is unaffected, because
 * storage is always inches. Same unit in and out returns the values untouched
 * rather than round-tripping them through a conversion that would drift.
 */
export function convertMeasurementUnit(profile, nextUnit) {
  const from = profile?.unit === "cm" ? "cm" : "in";
  const to = nextUnit === "cm" ? "cm" : "in";
  if (from === to) return { ...profile, unit: to };
  const converted = { ...profile, unit: to };
  for (const key of MEASUREMENT_KEYS) {
    const value = Number(profile?.[key]);
    converted[key] = Number.isFinite(value) && value > 0
      ? round(to === "cm" ? value * 2.54 : value / 2.54) : "";
  }
  return converted;
}
