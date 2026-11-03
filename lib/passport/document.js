// lib/passport/document.js — the passport data page's derived strings, in
// one place (client-safe, no imports), so the document on /board and its
// preview on /profile can never disagree about what the bearer's passport
// says. Every field is real state; nothing here invents a value.
//
// THE TASTE PASSPORT (owner's mock-up, 2 Nov 2026): the data page is a
// passport's — SURNAME, GIVEN NAME, DATE OF BIRTH, NATIONALITY, IDNTY (the
// passenger's own word, free text), TASTE TYPE, DATE OF ISSUE — under a
// clouded masthead carrying the serial (the month and day the account was
// created, as a machine line) and the passport number (six digits, read off
// the account number). Every label is translated once, into ONE language
// drawn for the passport from French, German, Spanish, Japanese or Arabic.
// The machine zone at the foot is two lines of the same measure, every
// character one a machine reads, the chevrons the filler.

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

// A date as a machine zone writes one: YYMMDD, or six zeros when none.
export function mrzDate(iso) {
  const d = sinceDate(iso);
  if (!d || Number.isNaN(d.getTime())) return "000000";
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
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

// A passport prints the surname first, then the given names. The username
// is one line of free text: its LAST word is the surname, the rest the
// given name(s); one word is a surname alone. Nothing is invented for a
// missing half — it prints as the empty field.
export function nameParts(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { surname: "", given: "" };
  return { surname: words[words.length - 1], given: words.slice(0, -1).join(" ") };
}

// FNV-1a over the account number: one stable integer per account, so a
// number READ OFF the real identity never changes between visits and two
// accounts practically never share one. Not a secret, not an identifier —
// the account number is the identifier; this is the document's own number.
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// THE PASSPORT NUMBER (the owner's annotation: "000,000–999,999"): six
// digits read off the account number, "000000" for a document not yet
// issued (no account). Printed as OASM·000·000, encoded in the zone as
// OASM000000.
export function passportNumber(uid) {
  if (!uid) return "000000";
  return String(fnv1a(String(uid)) % 1_000_000).padStart(6, "0");
}
export function passportNumberDisplay(uid) {
  const n = passportNumber(uid);
  return `OASM·${n.slice(0, 3)}·${n.slice(3)}`;
}

// THE SERIAL on the masthead (the owner's annotation: "month and day of
// passenger account creation"): AS<<<MM<<DD, run out in chevrons to 16.
export const SERIAL_WIDTH = 16;
export function serialLine(since) {
  const d = sinceDate(since);
  const mm = d ? String(d.getMonth() + 1).padStart(2, "0") : "00";
  const dd = d ? String(d.getDate()).padStart(2, "0") : "00";
  return `AS<<<${mm}<<${dd}`.padEnd(SERIAL_WIDTH, "<");
}

// THE LANGUAGES (owner, 2 Nov 2026: "the translation to everything [is]
// either French, German, Spanish, Japanese or Arabic, random selection"):
// one is drawn for the passport from the account number, so the draw is
// random across passports and the same every time one passport opens —
// a document whose language changed on every visit would read as a glitch,
// and a draw made on the server and again on the device would not match.
export const LANGUAGES = Object.freeze({
  fr: { name: "FRANÇAIS", dir: "ltr", passport: "PASSEPORT", surname: "NOM", given: "PRÉNOM", dob: "DATE DE NAISSANCE", nationality: "NATIONALITÉ",
    idnty: "IDENTITÉ", taste: "TYPE DE GOÛT", issue: "DATE DE DÉLIVRANCE", signature: "SIGNATURE DU PASSAGER", account: "N° DE COMPTE" },
  de: { name: "DEUTSCH", dir: "ltr", passport: "REISEPASS", surname: "NAME", given: "VORNAME", dob: "GEBURTSDATUM", nationality: "STAATSANGEHÖRIGKEIT",
    idnty: "IDENTITÄT", taste: "GESCHMACKSTYP", issue: "AUSSTELLUNGSDATUM", signature: "UNTERSCHRIFT DES PASSAGIERS", account: "KONTONUMMER" },
  es: { name: "ESPAÑOL", dir: "ltr", passport: "PASAPORTE", surname: "APELLIDOS", given: "NOMBRE", dob: "FECHA DE NACIMIENTO", nationality: "NACIONALIDAD",
    idnty: "IDENTIDAD", taste: "TIPO DE GUSTO", issue: "FECHA DE EXPEDICIÓN", signature: "FIRMA DEL PASAJERO", account: "N.º DE CUENTA" },
  ja: { name: "日本語", dir: "ltr", passport: "パスポート", surname: "姓", given: "名", dob: "生年月日", nationality: "国籍",
    idnty: "アイデンティティ", taste: "テイストタイプ", issue: "発行日", signature: "旅客署名", account: "口座番号" },
  ar: { name: "العربية", dir: "rtl", passport: "جواز سفر", surname: "اللقب", given: "الاسم", dob: "تاريخ الميلاد", nationality: "الجنسية",
    idnty: "الهوية", taste: "نوع الذوق", issue: "تاريخ الإصدار", signature: "توقيع المسافر", account: "رقم الحساب" },
});
export const LANGUAGE_CODES = Object.freeze(Object.keys(LANGUAGES));
// OCR A, as the mock-up sets its machine words: the owner "replaced the Os
// with 0s" — every Latin O is a zero on the serial, the number and the four
// words under the photo. Other scripts (kana, Arabic) carry no O.
export function ocr(s) {
  return String(s == null ? "" : s).replace(/O/g, "0");
}

// THE FOUR WORDS under the photo, the mock-up's exactly (owner, 2 Nov
// 2026: "the 4 translations underneath the passport photo must match the
// mock"): PASSP0RT/REISEPASS over パスポート/PASSEP0RT — English, German,
// Japanese, French — whatever language the labels drew.
export const PASSPORT_WORDS = Object.freeze([
  Object.freeze([{ code: "en", dir: "ltr", word: "PASSPORT" }, { code: "de", dir: "ltr", word: "REISEPASS" }]),
  Object.freeze([{ code: "ja", dir: "ltr", word: "パスポート" }, { code: "fr", dir: "ltr", word: "PASSEPORT" }]),
]);
export function passportWords() {
  return PASSPORT_WORDS;
}

export function passportLanguage(uid) {
  // a passport not yet issued is drawn too, so the empty document reads as a document
  const code = LANGUAGE_CODES[fnv1a(String(uid || "unissued")) % LANGUAGE_CODES.length];
  return { code, ...LANGUAGES[code] };
}

// THE MACHINE ZONE, two lines of the measure (the owner's mock-up, 2 Nov
// 2026, "a little more even": both lines the same 52 characters, the same
// face, the same spacing):
//   line 1  IDNTY<<TASTETYPE<<DATEOFISSUE<<PASSPORTNO
//   line 2  A<NATIONALITY<<SURNAME<GIVENNAME<<ACCOUNTNO<DATEOFBIRTH
// every field one the data page prints, encoded as mrzWord does, dates as
// YYMMDD, the account number's first nine (a TD3 document number's width),
// the chevrons the filler. An empty field encodes to nothing between its
// separators — never a dash, never a word the page does not print.
export const MRZ_WIDTH = 52;
export function mrzZone({ uid, name, dob, nationality, idnty, taste, since }) {
  const fit = (s) => s.padEnd(MRZ_WIDTH, "<").slice(0, MRZ_WIDTH);
  const { surname, given } = nameParts(name);
  const account = (uid ? String(uid) : "UNISSUED").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 9);
  const one = fit([mrzWord(idnty), mrzWord(taste), mrzDate(since), "OASM" + passportNumber(uid)].join("<<"));
  const two = fit(["A<" + mrzWord(nationality), [mrzWord(surname), mrzWord(given)].join("<"), account + "<" + mrzDate(dob)].join("<<"));
  return [one, two];
}
