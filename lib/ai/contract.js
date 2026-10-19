// lib/ai/contract.js
// Shared helpers that keep the Alpha Brain foundation HONEST.
// Every placeholder in lib/* returns through one of these, so nothing can
// silently pretend to be real intelligence (constitution: no fake AI).

// A capability that has a contract but no implementation yet.
export function notImplemented(feature, hint) {
  return {
    ok: false,
    implemented: false,
    feature,
    hint: hint || "placeholder — wire a real provider/service here",
  };
}

// Curated or generated stand-in data. Consumers can always detect it.
export function mockMarked(data, note) {
  return { ok: true, mock: true, note: note || "curated mock data", data };
}

// A real result computed by live code (the Alpha Learning Bridge or v0 math).
export function real(data, via) {
  return { ok: true, mock: false, via, data };
}
