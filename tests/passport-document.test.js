// tests/passport-document.test.js — THE PASSPORT DOCUMENT (owner, 31 Oct
// 2026: "redesign the passport to mimic the new style of the app … a sleek
// tron type of vibe … more [MRZ] … and chevrons"). Held here:
//   * the two elements the owner circled stay exactly: the serial at the top
//     right ("№ AS·00·08") and the four-language title block;
//   * the machine zone encodes the REAL fields of the data page — type P,
//     code ASM, the username, the account number, member-since, the class,
//     BASED IN, the country of origin, the handle, the taste class and the
//     counts — and nothing else; the chevrons are its filler, every line the
//     measure, every character one a machine reads;
//   * the page hands the zone the same values it prints;
//   * the device's line and the plate carry no colour but the tokens'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mrzLines, mrzWord, mrzZone, MRZ_WIDTH } from "../lib/passport/document.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const board = strip(read("app/board/page.js"));

const bearer = {
  uid: "u-8086654e-24c2-46e7-8d18-c772a0905f54", name: "Unnamed Reader", handle: "@reader", since: "2026-10-31",
  klass: "DEVICE IDENT", basedIn: "Bowie, MD", origin: "US", taste: "Professional",
  pinCount: 3, ticketCount: 1, areaCode: 240, savedCount: 7, convictionCount: 8,
};

test("the serial and the title block stay exactly as the owner circled them", () => {
  assert.match(board, /<span className="ppnum">№ AS·\{String\(boards\.length\)\.padStart\(2, "0"\)\}·\{String\(convictions\(\)\.length\)\.padStart\(2, "0"\)\}<\/span>/, "№ AS·00·08: boards and convictions, two digits each");
  assert.match(css, /\n\.ppnum \{ position: absolute; right: 12px; top: 5px; font-family: var\(--helv\); font-size: 15px; color: var\(--sig\); text-shadow: var\(--glow\); z-index: 2; \}/, "the serial's place and face");
  assert.match(board, /<span className="ppquad"><b>PASSPORT<\/b><span>パスポート<\/span><span>REISEPASS<\/span><span>PASSEPORT<\/span><\/span>/, "PASSPORT / パスポート / REISEPASS / PASSEPORT");
  assert.match(css, /\n\.ppquad \{ display: grid; gap: 2px; justify-items: center; font-size: 8px;\n  letter-spacing: 0\.22em; color: var\(--grey\); line-height: 1\.35; \}/, "the block's face");
  assert.match(css, /\n\.ppquad b \{ font-weight: 400; font-size: 10px; color: var\(--sig\); text-shadow: var\(--glow\); letter-spacing: 0\.3em; \}/);
  assert.ok(board.indexOf('className="ppquad"') < board.indexOf('className="ppphoto"'), "the title block above the photo, as before");
});

test("the machine zone: four lines of the measure, every character one a machine reads, the chevrons the filler", () => {
  const zone = mrzZone(bearer);
  assert.equal(zone.length, 4);
  assert.equal(MRZ_WIDTH, 52);
  for (const line of zone) {
    assert.equal(line.length, MRZ_WIDTH, line);
    assert.match(line, /^[A-Z0-9<]+$/, "nothing a machine cannot read: " + line);
    assert.match(line, /<$/, "every line runs out in chevrons: " + line);
  }
  const { top, bottom } = mrzLines(bearer);
  assert.equal(zone[0], top, "line 1 is the TD3 pair's, unchanged");
  assert.equal(zone[1], bottom, "line 2 is the TD3 pair's, unchanged");
});

test("the zone encodes the real fields and nothing else", () => {
  const [l1, l2, l3, l4] = mrzZone(bearer);
  assert.match(l1, /^P<ASMUNNAMED<READER<<FASHION<MEMBER<+$/, "type P, code ASM, the username");
  assert.match(l2, /^U8086654E0ASM2610310X<P003B001A240<<24C246E78D18<+$/, "the account number (the uid's first nine and the next twelve), member-since as YYMMDD, pins, purchases, the area code");
  assert.equal(l3, "DEVICE<IDENT<<BOWIE<MD<<US".padEnd(52, "<"), "the class, BASED IN, the country of origin");
  assert.equal(l4, "READER<<PROFESSIONAL<<S007C08".padEnd(52, "<"), "the handle, the taste class, SAVED and CONVICTIONS");
  // an empty field encodes to nothing — never a dash, never a word the page does not print
  const bare = mrzZone({ uid: null, name: "", handle: "", since: "", klass: "DEVICE IDENT", basedIn: "", origin: "—", taste: "UNCHARTED" });
  assert.equal(bare[0], "P<ASMUNNAMED<READER<<FASHION<MEMBER".padEnd(52, "<"));
  assert.equal(bare[2], "DEVICE<IDENT<<<<".padEnd(52, "<"), "no city, no country: the fields stand empty between their separators");
  assert.equal(bare[3], "<<UNCHARTED<<S000C00".padEnd(52, "<"));
  assert.equal(bare[1].slice(0, 9), "UNISSUED<", "no account: UNISSUED, as the pair already says");
  // the counts are clamped to their digits, never spilling into the next field
  assert.match(mrzZone({ ...bearer, savedCount: 12345, convictionCount: 999 })[3], /<<S999C99<+$/);
  // a long line is cut to the measure, never wrapped
  const long = mrzZone({ ...bearer, klass: "AUTHENTICATED ACCOUNT", basedIn: "Saint-Germain-des-Prés, Île-de-France", origin: "France" });
  assert.equal(long[2].length, 52);
  assert.match(long[2], /^AUTHENTICATED<ACCOUNT<<SAINT<GERMAIN<DES<PR/, "accents are not machine characters: they become the filler");
});

test("mrzWord: upper case, every run of anything else one chevron, none at the ends", () => {
  assert.equal(mrzWord("Bowie, MD"), "BOWIE<MD");
  assert.equal(mrzWord("@reader"), "READER");
  assert.equal(mrzWord("—"), "");
  assert.equal(mrzWord(null), "");
  assert.equal(mrzWord("  a  b  "), "A<B");
});

test("the page hands the zone the values it prints: one variable per field, on the page and in the zone alike", () => {
  assert.match(board, /const mrz = mrzZone\(\{ uid, name: pinfo\.name, handle: pinfo\.handle, since: pinfo\.since, klass, basedIn: baseCity, origin: pinfo\.origin,\s*taste, pinCount, ticketCount, areaCode: pinfo\.area \|\| 0, savedCount, convictionCount: convictions\(\)\.length \}\);/);
  assert.match(board, /<dt>CLASS<em>\/ Classe<\/em><\/dt><dd>\{klass\}<\/dd>/);
  assert.match(board, /<dt>BASED IN<em>\/ Basé à<\/em><\/dt><dd>\{baseCity \|\| "—"\}/);
  assert.match(board, /<dt>COUNTRY OF ORIGIN<em>\/ Pays<\/em><\/dt><dd>\{pinfo\.origin\}<\/dd>/);
  assert.match(board, /<dt>TASTE CLASS<em>\/ Classe de goût<\/em><\/dt><dd><span className="ppstar">\*<\/span> \{taste\}<\/dd>/);
  assert.match(board, /<dt>SAVED<\/dt><dd>\{savedCount\}<\/dd>/);
  // the serial again at the band's left, for the machine, from the same two counts
  assert.match(board, /<MrzLine className="ppserial" words=\{\["AS", String\(boards\.length\)\.padStart\(2, "0"\), String\(convictions\(\)\.length\)\.padStart\(2, "0"\)\]\} width=\{16\} \/>/);
});

test("the device's line (Blocks.jsx MrzLine): the data in <b>, the filler in <i>, run out to the measure, hidden from assistive technology", () => {
  const blocks = strip(read("app/components/Blocks.jsx"));
  assert.match(blocks, /export function MrzLine\(\{ text, words, width = MRZ_WIDTH, cursor = false, className = "" \}\)/);
  assert.match(blocks, /if \(line\.length < width\) line \+= "<"\.repeat\(width - line\.length\);/, "run out in chevrons to the measure, never cut here (the encoder cuts)");
  assert.match(blocks, /const parts = line\.split\(\/\(<\+\)\/\)\.filter\(Boolean\);/);
  assert.match(blocks, /p\[0\] === "<" \? <i key=\{i\}>\{p\}<\/i> : <b key=\{i\}>\{p\}<\/b>/);
  assert.match(blocks, /<span className=\{"mrzline" \+ \(className \? " " \+ className : ""\)\} aria-hidden="true">/);
  assert.match(blocks, /\{cursor \? <span className="mrzcursor" \/> : null\}/);
  // the preview on /profile reads the same encoder through the same line
  const preview = strip(read("app/components/PassportPreview.jsx"));
  assert.match(preview, /<MrzLine text=\{mrz\.top\} \/><MrzLine text=\{mrz\.bottom\} \/>/);
  assert.ok(!/MrzTint/.test(preview + board), "the old tinting helper is gone");
});

test("colour only through the tokens: no literal colour in the passport's components", () => {
  for (const f of ["app/components/PassportPlate.jsx", "app/components/PassportSecurity.jsx", "app/components/PassportPreview.jsx", "app/components/Blocks.jsx"]) {
    const src = strip(read(f));
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(src), f + " carries a literal colour");
  }
  // the plate's own parts are the logo's tokens; the mask's #fff / #000 are luminance, not colour, as the logo's
  assert.match(css, /\.pptint \{ fill: var\(--wm-cut-tint\); \}/);
  assert.match(css, /\.ppstar \{ color: var\(--warn\); text-shadow: var\(--glow-r\); \}/, "the data page's asterisk is the house red, glowing red");
  assert.ok(!/<span className="red">\*<\/span>/.test(board.slice(board.indexOf('className="ppdoc'), board.indexOf("ppdocacts"))), "no white-accent asterisk left on the document");
});
