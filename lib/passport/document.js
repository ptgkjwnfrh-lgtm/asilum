// lib/passport/document.js — the passport data page's derived strings, in
// one place (client-safe, no imports), so the document on /board and its
// preview on /profile can never disagree about what the bearer's passport
// says. Every field is real state; nothing here invents a value.
//
// The machine zone encodes the bearer's REAL account number (the uid) in
// the document-number and personal-number fields, TD3-style, and three
// counters that are all real: P = pins linked (items across the bearer's
// boards), B = purchases raised through the app (tickets), A = the device's
// area code in time (UTC offset, minutes).

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// "2026-09-09" → a local Date. Date-only strings parse as UTC midnight —
// anchoring to local time keeps the stamped day from shifting back a day
// in western timezones.
export function sinceDate(since) {
  return since ? new Date(since + "T00:00:00") : null;
}

// "09 SEP 2026", or "—" when no day is stamped.
export function sinceDisplay(since) {
  const d = sinceDate(since);
  return d ? `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "—";
}

// The two 52-character machine-zone lines.
export function mrzLines({ uid, name, since, pinCount = 0, ticketCount = 0, areaCode = 0 }) {
  const mrzId = (uid || "UNISSUED").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const mrzName = (name || "UNNAMED READER").replace(/[^a-z0-9 ]/gi, "")
    .trim().toUpperCase().replace(/ +/g, "<");
  const d = sinceDate(since);
  const sinceMrz = d
    ? `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    : "000000";
  const pad3 = (n) => String(Math.min(999, Math.abs(n))).padStart(3, "0");
  const top = ("P<ASM" + mrzName + "<<FASHION<MEMBER").padEnd(52, "<").slice(0, 52);
  const bottom = (mrzId.slice(0, 9).padEnd(9, "<") + "0ASM" + sinceMrz + "0X<" +
    "P" + pad3(pinCount) + "B" + pad3(ticketCount) + "A" + pad3(areaCode) + "<<" +
    mrzId.slice(9, 21)).padEnd(52, "<").slice(0, 52);
  return { top, bottom };
}

// The bearer's convictions: the strongest taste weights, signed, up to ten.
export function convictionsOf(weights) {
  if (!weights) return [];
  return Object.entries(weights)
    .filter(([, w]) => Math.abs(w) > 0.01)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 10);
}
