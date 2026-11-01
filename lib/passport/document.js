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

// One MRZ word: upper case, every run of anything but a letter or a digit
// a single "<" (the filler of a real machine zone; "—" and "" encode to
// nothing). Shared with the device's MrzLine (app/components/Blocks.jsx).
export function mrzWord(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]+/g, "<").replace(/^<+|<+$/g, "");
}

// THE MACHINE ZONE, four 52-character lines (owner, 31 Oct 2026: "i want
// more [MRZ] … and chevrons"): every line encodes a field the data page
// prints, and nothing it does not — type P, code ASM, the username, the
// account number, member-since and the three counters (lines 1 and 2, the
// TD3 pair above, unchanged), then the class, BASED IN and the country of
// origin (line 3), the handle, the taste class and the SAVED and
// CONVICTIONS counts (line 4). The chevrons are the filler, as a real
// machine zone's are: a field runs out in them to the next, and every line
// runs out to the measure.
export const MRZ_WIDTH = 52;
export function mrzZone({ uid, name, handle, since, klass, basedIn, origin, taste, pinCount = 0, ticketCount = 0, areaCode = 0, savedCount = 0, convictionCount = 0 }) {
  const { top, bottom } = mrzLines({ uid, name, since, pinCount, ticketCount, areaCode });
  const fit = (s) => s.padEnd(MRZ_WIDTH, "<").slice(0, MRZ_WIDTH);
  const pad = (n, w) => String(Math.min(10 ** w - 1, Math.abs(Math.round(n) || 0))).padStart(w, "0");
  const identity = fit([mrzWord(klass), mrzWord(basedIn), mrzWord(origin)].join("<<"));
  const record = fit([mrzWord(handle), mrzWord(taste), "S" + pad(savedCount, 3) + "C" + pad(convictionCount, 2)].join("<<"));
  return [top, bottom, identity, record];
}
