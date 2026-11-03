// tests/passport-document.test.js — THE TASTE PASSPORT (the owner's mock-up
// of 2 Nov 2026, docs/v2/mocks/2026-11-02-taste-passport/; before it the
// Tron passport of 31 Oct: "a sleek tron type of vibe … more [MRZ] … and
// chevrons"). Held here:
//   * the masthead carries the serial — the month and day the account was
//     created, as a machine line — and the passport number, six digits read
//     off the account number, both the same on every opening;
//   * every label is translated once, into ONE language drawn for the
//     passport from French, German, Spanish, Japanese or Arabic — the same
//     one each time the same passport opens;
//   * the machine zone is TWO lines of the same measure, every field one
//     the data page prints — IDNTY, the taste type, the date of issue, the
//     passport number; the nationality, the surname and the given name, the
//     account number and the date of birth — the chevrons the filler, every
//     character one a machine reads;
//   * SEX is IDNTY, free text the passenger writes; the signature is the
//     username unless the passenger signs;
//   * the page and the preview hand the zone the same values they print;
//   * the device's line and the document's parts carry no colour but the
//     tokens'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LANGUAGES, LANGUAGE_CODES, MRZ_WIDTH, SERIAL_WIDTH, mrzDate, mrzWord, mrzZone, nameParts, passportLanguage, passportNumber, passportNumberDisplay, serialLine,
} from "../lib/passport/document.js";
import { bars, rampPath, BARCODE_W, BARCODE_H } from "../lib/passport/barcode.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const board = strip(read("app/board/page.js"));
const preview = strip(read("app/components/PassportPreview.jsx"));

const bearer = {
  uid: "u-8086654e-24c2-46e7-8d18-c772a0905f54", name: "Unnamed Reader", since: "2026-10-31", dob: "2001-07-04",
  nationality: "US", idnty: "whatever i want", taste: "Professional",
};

test("the serial: the month and day the account was created, as a machine line of 16", () => {
  assert.equal(SERIAL_WIDTH, 16);
  assert.equal(serialLine("2026-10-31"), "AS<<<10<<31<<<<<");
  assert.equal(serialLine("2026-01-05"), "AS<<<01<<05<<<<<", "two digits each");
  assert.equal(serialLine(""), "AS<<<00<<00<<<<<", "no account: zeros, never a word the page does not print");
  for (const s of [serialLine("2026-10-31"), serialLine("")]) { assert.equal(s.length, SERIAL_WIDTH); assert.match(s, /^[A-Z0-9<]+$/); }
  assert.match(board, /<MrzLine className="ppserial" text=\{serialLine\(pinfo\.since\)\} width=\{SERIAL_WIDTH\} \/>/, "the document's serial");
  assert.match(preview, /<MrzLine className="ppserial" text=\{serialLine\(since\)\} width=\{SERIAL_WIDTH\} \/>/, "the preview's, from the same line");
});

test("the passport number: six digits read off the account number, the same every time, OASM·000·000 on the page", () => {
  const n = passportNumber(bearer.uid);
  assert.match(n, /^\d{6}$/);
  assert.equal(passportNumber(bearer.uid), n, "stable");
  assert.notEqual(passportNumber("u-00000000-0000-0000-0000-000000000001"), n, "another account, another number");
  assert.equal(passportNumber(null), "000000", "unissued: zeros");
  assert.equal(passportNumberDisplay(bearer.uid), `OASM·${n.slice(0, 3)}·${n.slice(3)}`);
  assert.equal(passportNumberDisplay(null), "OASM·000·000");
  assert.match(board, /<span className="ppnum">№ \{passportNumberDisplay\(uid\)\}<\/span>/);
  assert.match(preview, /<span className="ppnum">№ \{passportNumberDisplay\(uid\)\}<\/span>/);
});

test("one language per passport, drawn from the five, the same on every opening; every label has a word in it", () => {
  assert.deepEqual(LANGUAGE_CODES, ["fr", "de", "es", "ja", "ar"]);
  const keys = ["name", "dir", "passport", "surname", "given", "dob", "nationality", "idnty", "taste", "issue", "signature", "account"];
  for (const code of LANGUAGE_CODES) for (const k of keys) assert.ok(LANGUAGES[code][k], `${code}.${k}`);
  assert.equal(LANGUAGES.ar.dir, "rtl", "Arabic runs right to left");
  assert.equal(LANGUAGES.de.passport, "REISEPASS"); assert.equal(LANGUAGES.fr.passport, "PASSEPORT"); assert.equal(LANGUAGES.ja.passport, "パスポート");
  const drawn = new Set();
  for (let i = 0; i < 200; i++) drawn.add(passportLanguage(`u-${i}-24c2-46e7-8d18-c772a0905f54`).code);
  assert.equal(drawn.size, 5, "across passports every language is drawn");
  const one = passportLanguage(bearer.uid);
  assert.equal(passportLanguage(bearer.uid).code, one.code, "the same passport, the same language");
  assert.ok(LANGUAGE_CODES.includes(passportLanguage(null).code), "an unissued document is drawn too");
  // the page prints "ENGLISH /" then the drawn word, with its language and direction, on every field
  for (const [label, key] of [["SURNAME", "surname"], ["GIVEN NAME", "given"], ["DATE OF BIRTH", "dob"], ["NATIONALITY", "nationality"], ["IDNTY", "idnty"], ["TASTE TYPE", "taste"], ["DATE OF ISSUE", "issue"], ["ACCOUNT NO", "account"]]) {
    assert.match(board, new RegExp(label.replace(/ /g, " ") + " \\/<em lang=\\{lang\\.code\\} dir=\\{lang\\.dir\\}>\\{lang\\." + key + "\\}<\\/em>"), label);
  }
  assert.match(board, /<PassportSignature name=\{pinfo\.name\} label="PASSENGER SIGNATURE" translation=\{lang\.signature\} dir=\{lang\.dir\} \/>/);
  assert.match(board, /<span className="ppquad" lang=\{lang\.code\}><b lang="en">PASSPORT<\/b><span dir=\{lang\.dir\}>\{lang\.passport\}<\/span><\/span>/, "the document's word for itself, English and the drawn language");
  assert.ok(!/SEX/.test(board.slice(board.indexOf('className="ppdoc'), board.indexOf("ppdocacts"))), "SEX is IDNTY now");
  assert.match(board, /id="ppidnty" className="ppwrite" type="text" maxLength=\{32\} placeholder="—" value=\{pinfo\.idnty \|\| ""\} onChange=\{\(e\) => writeField\("idnty", e\.target\.value\)\}/, "IDNTY is free text the passenger writes");
});

test("the surname and the given name come off the username: the last word the surname", () => {
  assert.deepEqual(nameParts("Unnamed Reader"), { surname: "Reader", given: "Unnamed" });
  assert.deepEqual(nameParts("Jean Michel Basquiat"), { surname: "Basquiat", given: "Jean Michel" });
  assert.deepEqual(nameParts("Cher"), { surname: "Cher", given: "" }, "one word: a surname alone, nothing invented");
  assert.deepEqual(nameParts(""), { surname: "", given: "" });
  assert.deepEqual(nameParts(null), { surname: "", given: "" });
});

test("the machine zone: two lines of the measure, every character one a machine reads, the chevrons the filler", () => {
  const zone = mrzZone(bearer);
  assert.equal(zone.length, 2);
  assert.equal(MRZ_WIDTH, 52);
  for (const line of zone) {
    assert.equal(line.length, MRZ_WIDTH, line);
    assert.match(line, /^[A-Z0-9<]+$/, "nothing a machine cannot read: " + line);
    assert.match(line, /<$/, "every line runs out in chevrons: " + line);
  }
  assert.equal(zone[0].length, zone[1].length, "even");
});

test("the zone encodes the real fields and nothing else", () => {
  const [l1, l2] = mrzZone(bearer);
  const n = passportNumber(bearer.uid);
  assert.equal(l1, `WHATEVER<I<WANT<<PROFESSIONAL<<261031<<OASM${n}`.padEnd(52, "<"), "IDNTY, the taste type, the date of issue, the passport number");
  assert.equal(l2, "A<US<<READER<UNNAMED<<U8086654E<010704".padEnd(52, "<"), "the nationality, the surname and the given name, the account number's first nine, the date of birth");
  // an empty field encodes to nothing — never a dash, never a word the page does not print
  const bare = mrzZone({ uid: null, name: "", dob: "", nationality: "—", idnty: "", taste: "UNCHARTED", since: "" });
  assert.equal(bare[0], "<<UNCHARTED<<000000<<OASM000000".padEnd(52, "<"));
  assert.equal(bare[1], "A<<<<<<UNISSUED<000000".padEnd(52, "<"), "no account: UNISSUED; no name, no nationality: the fields stand empty between their separators");
  assert.equal(mrzDate("2001-07-04"), "010704"); assert.equal(mrzDate(""), "000000"); assert.equal(mrzDate("nonsense"), "000000");
  // a long line is cut to the measure, never wrapped
  const long = mrzZone({ ...bearer, idnty: "a very long word the passenger wrote on the document", taste: "Professional" });
  assert.equal(long[0].length, 52);
  assert.match(long[0], /^A<VERY<LONG<WORD<THE<PASSENGER<WROTE<ON<THE<DOCUMENT/);
});

test("mrzWord: upper case, every run of anything else one chevron, none at the ends", () => {
  assert.equal(mrzWord("Bowie, MD"), "BOWIE<MD");
  assert.equal(mrzWord("@reader"), "READER");
  assert.equal(mrzWord("—"), "");
  assert.equal(mrzWord(null), "");
  assert.equal(mrzWord("  a  b  "), "A<B");
});

test("the page and the preview hand the zone the values they print: one variable per field", () => {
  assert.match(board, /const \{ surname, given \} = nameParts\(pinfo\.name\);/);
  assert.match(board, /const mrz = mrzZone\(\{ uid, name: pinfo\.name, dob: pinfo\.dob, nationality: pinfo\.origin, idnty: pinfo\.idnty, taste, since: pinfo\.since \}\);/);
  assert.match(board, /<dd>\{surname\.toUpperCase\(\) \|\| "—"\}<\/dd>/);
  assert.match(board, /<dd>\{given\.toUpperCase\(\) \|\| "—"\}<\/dd>/);
  assert.match(board, /<dd>\{pinfo\.origin\}<\/dd>/);
  assert.match(board, /<dd><span className="ppstar">\*<\/span> \{taste\}<\/dd>/);
  assert.match(board, /<dd>\{sinceDisplay\}<\/dd>/);
  assert.match(board, /<dd className="ppmono">\{uid \|\| "—"\}<\/dd>/);
  assert.match(preview, /const mrz = mrzZone\(\{ uid, name: info\.name, dob: info\.dob, nationality: origin, idnty: info\.idnty, taste, since \}\);/);
  assert.match(preview, /\{mrz\.map\(\(line, i\) => <MrzLine key=\{i\} text=\{line\} \/>\)\}/);
  // the two written fields are kept with the display name on this device, never sent anywhere
  assert.match(board, /function writeField\(k, v\) \{\s*setPinfo\(\(p\) => \(\{ \.\.\.p, \[k\]: v \}\)\);\s*try \{ saveProfileInfo\(\{ \.\.\.getProfileInfo\(\), \[k\]: v \}\); \} catch \{\}\s*\}/);
  assert.ok(!/fetch\([^)]*(idnty|dob)/.test(board), "no request carries them");
});

test("the signature: the username until the passenger signs; the pad in the slot, kept on this device as a mask", () => {
  const sig = strip(read("app/components/PassportSignature.jsx"));
  assert.match(sig, /export const SIGNATURE_KEY = "asilum-pp-sign";/);
  assert.match(sig, /<span className="ppsigname">\{printed \|\| "—"\}<\/span>/, "the username");
  assert.match(sig, /<canvas ref=\{padRef\} className="ppsigpad" aria-label="sign here" onPointerDown=\{down\} onPointerMove=\{move\} onPointerUp=\{up\} onPointerCancel=\{up\} \/>/, "the pad, pointer events");
  assert.match(sig, /ctx\.strokeStyle = getComputedStyle\(c\)\.color;/, "drawn in the document's ink, no literal colour");
  assert.match(sig, /WebkitMaskImage: `url\(\$\{signature\}\)`, maskImage: `url\(\$\{signature\}\)`/, "kept as a mask: the ink of either theme");
  assert.match(sig, /window\.localStorage\.setItem\(SIGNATURE_KEY, data\)/);
  assert.match(sig, /window\.localStorage\.removeItem\(SIGNATURE_KEY\)/, "CLEAR returns the slot to the username");
  assert.match(css, /\.ppsigpad \{[^}]*touch-action: none;/, "the page does not scroll under the stroke");
  assert.match(css, /\.ppsignink \{[^}]*background: currentColor;/);
});

test("the bar code: a cosine ramp into bars read off the passport number, the same every time; cut in the document's ink", () => {
  assert.equal(BARCODE_W, 600); assert.equal(BARCODE_H, 96);
  assert.match(rampPath(), /^M 0 96 L 0\.0 92\.0 L .* L 300\.0 0\.0 L 300 96 Z$/, "from the foot at the left up to the full height at the middle");
  const a = bars(bearer.uid), b = bars(bearer.uid), c = bars("u-00000000-0000-0000-0000-000000000001");
  assert.deepEqual(a, b, "stable");
  assert.notDeepEqual(a, c, "another account, another code");
  for (const [x, w] of a) { assert.ok(x >= 300 && x + w <= 600, `bar at ${x} wide ${w} inside the right half`); assert.ok(w >= 3 && w <= 12); }
  assert.match(board, /<PassportBarcode uid=\{uid\} \/>/);
  assert.match(css, /\n\.ppcut \{ fill: var\(--ink\); \}/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \.ppbarcode \{ filter: var\(--wm-glow\); \}/, "the logo's white glow in dark");
});

test("the cloud: the serial, the number and the zone under the fixtures' frost at a lower opacity, their glow kept; the map very faint", () => {
  assert.match(css, /\n\.ppcloud \{ position: absolute; inset: 0; z-index: 2; pointer-events: none;/);
  assert.match(css, /\.ppcloud \{[^}]*backdrop-filter: blur\(2\.2px\) saturate\(160%\);/s);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{ \.ppcloud \{ -webkit-backdrop-filter: none; backdrop-filter: none; \} \}/);
  assert.match(css, /\.ppmast \.ppserial, \.ppmast \.ppnum \{ position: relative; z-index: 1; opacity: var\(--pp-under\); \}/);
  assert.match(css, /\.ppdoc \.ppmrz \.mrzline \{[^}]*opacity: var\(--pp-under\); \}/);
  assert.match(css, /\.ppnum \{[^}]*color: var\(--sig\); text-shadow: var\(--glow\);/, "the number glows under the cloud");
  for (const where of [board, preview]) {
    assert.ok(/<span className="ppcloud" aria-hidden="true" \/>\s*<\/(header|div)>/.test(where.slice(where.indexOf("ppmast"))), "the cloud over the masthead");
    assert.equal((where.match(/className="ppcloud"/g) || []).length, 2, "and over the zone");
  }
  assert.match(css, /\n\.ppholo-a \{ opacity: 0\.09; \}/, "the map very, very faint");
  assert.ok(!/ppholo-b|ppterrain|ppsummit|ppmicro|ppplate|ppnation|ppsec\b/.test(css), "the hot window, the microprint, the plate and the old band are gone");
});

test("the name: the logo's set, bigger and bolder, one line", () => {
  assert.match(board, /<h2 className="pptitle">ASILUM TASTE PASSPORT<\/h2>/);
  assert.match(css, /\.pptitle \{[^}]*letter-spacing: -0\.096em; -webkit-text-stroke: 0\.04em currentColor; color: var\(--ink\); text-shadow: none; \}/s, "the wordmark's −0.096em, a stroke for the bold, the ink unlit");
  assert.match(css, /\.pptitle \{[^}]*white-space: nowrap;/s);
});

test("colour only through the tokens: no literal colour in the passport's components", () => {
  for (const f of ["app/components/PassportSignature.jsx", "app/components/PassportBarcode.jsx", "app/components/PassportSecurity.jsx", "app/components/PassportPreview.jsx", "app/components/Blocks.jsx"]) {
    const src = strip(read(f));
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(src), f + " carries a literal colour");
  }
  assert.match(css, /\.ppstar \{ color: var\(--warn\); text-shadow: var\(--glow-r\); \}/, "the data page's asterisk is the house red, glowing red");
});
