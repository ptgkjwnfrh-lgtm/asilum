import { FIT_LADDER } from "./sizing.js";

export const MEASUREMENT_KEYS = ["chest", "waist", "hips", "inseam", "height"];
export const EMPTY_MEASUREMENTS = {
  usualSize: "", unit: "in", chest: "", waist: "", hips: "", inseam: "", height: "",
};

const INCH_RANGES = {
  chest: [20, 100], waist: [18, 100], hips: [20, 100], inseam: [15, 60], height: [36, 96],
};
const round = (value) => +value.toFixed(2);

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

export function measurementProfileForBrain(profile = {}) {
  const unit = profile.unit === "cm" ? "cm" : "in";
  const measurements = {};
  for (const key of MEASUREMENT_KEYS) {
    const value = Number(profile[key]);
    if (Number.isFinite(value) && value > 0) measurements[key] = round(unit === "cm" ? value / 2.54 : value);
  }
  return { usualSize: String(profile.usualSize || "").toUpperCase(), measurements };
}

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
