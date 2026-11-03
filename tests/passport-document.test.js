// tests/passport-document.test.js — THE TASTE PASSPORT (the owner's mock-up
// of 2 Nov 2026, docs/v2/mocks/2026-11-02-taste-passport/, traced — "just
// trace the picture"; before it the Tron passport of 31 Oct). Held here:
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
//   * the bar code is the logo's brick mirrored, the bars cut out of it as
//     the word is cut out of the logo, at the logo's slant; the masthead's
//     foot takes the same slant; the zone is unclouded, every face Michroma,
//     nothing of the old artwork but the map;
//   * the device's line and the document's parts carry no colour but the
//     tokens'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LANGUAGES, LANGUAGE_CODES, MRZ_WIDTH, SERIAL_WIDTH, mrzDate, mrzWord, mrzZone, nameParts, ocr, passportLanguage, passportNumber, passportNumberDisplay, passportWords, serialLine,
} from "../lib/passport/document.js";
import { bars, barcodeGeometry, barcodePath, BARCODE_W, BARCODE_H } from "../lib/passport/barcode.js";
import { brickGeometry } from "../lib/wordmark.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const board = strip(read("app/board/page.js"));
const page = strip(read("app/components/PassportDocument.jsx"));
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
  assert.match(page, /<MrzLine className="ppserial" text=\{serialLine\(info\.since\)\} width=\{SERIAL_WIDTH\} \/>/, "the page's serial");
  for (const where of [board, preview]) assert.match(where, /<PassportDocument uid=\{uid\} info=\{/, "the document and the preview are the one page (PassportDocument.jsx)");
});

test("the passport number: six digits read off the account number, the same every time, OASM·000·000 on the page", () => {
  const n = passportNumber(bearer.uid);
  assert.match(n, /^\d{6}$/);
  assert.equal(passportNumber(bearer.uid), n, "stable");
  assert.notEqual(passportNumber("u-00000000-0000-0000-0000-000000000001"), n, "another account, another number");
  assert.equal(passportNumber(null), "000000", "unissued: zeros");
  assert.equal(passportNumberDisplay(bearer.uid), `OASM·${n.slice(0, 3)}·${n.slice(3)}`);
  assert.equal(passportNumberDisplay(null), "OASM·000·000");
  assert.match(page, /<span className="ppnum"><i className="ppno" aria-label="number">N<u>o<\/u><\/i>\{ocr\(passportNumberDisplay\(uid\)\)\}<\/span>/, "the numero as the mock-up draws it — a bold serif N, a small raised o underlined — then the number in OCR A with its O a zero");
  assert.match(css, /\.ppnum \.ppno \{[^}]*font-family: var\(--numero\); font-weight: 700;/);
  assert.match(css, /\.ppnum \.ppno u \{[^}]*vertical-align: 0\.55em; text-decoration: underline;/);
  assert.equal(ocr("OASM·000·000"), "0ASM·000·000"); assert.equal(ocr("PASSPORT"), "PASSP0RT"); assert.equal(ocr("パスポート"), "パスポート", "other scripts carry no O");
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
  assert.match(page, /const T = \(key\) => <em lang=\{lang\.code\} dir=\{lang\.dir\}>\{lang\[key\]\}<\/em>;/, "every translation with its language and direction");
  for (const [label, key] of [["SURNAME", "surname"], ["GIVEN NAME", "given"], ["DATE OF BIRTH", "dob"], ["NATIONALITY", "nationality"], ["IDNTY", "idnty"], ["TASTE TYPE", "taste"], ["DATE OF ISSUE", "issue"], ["ACCOUNT NO", "account"]]) {
    assert.match(page, new RegExp(label + ' \\/\\{T\\("' + key + '"\\)\\}'), label);
  }
  assert.match(page, /<PassportSignature name=\{info\.name\} label="PASSENGER SIGNATURE" translation=\{lang\.signature\} dir=\{lang\.dir\} editable=\{editable\} \/>/);
  // four words under the photo, two lines, the mock-up's exactly: PASSP0RT/REISEPASS over パスポート/PASSEP0RT
  const lines = passportWords();
  assert.deepEqual(lines.map((p) => p.map((w) => ocr(w.word)).join("/")), ["PASSP0RT/REISEPASS", "パスポート/PASSEP0RT"]);
  assert.deepEqual(lines.flat().map((w) => w.code), ["en", "de", "ja", "fr"]);
  assert.equal(passportWords(), passportWords("u-1"), "the same four on every passport, whatever the labels drew");
  assert.match(page, /\{passportWords\(\)\.map\(\(pair, i\) => \(/, "the page prints the four");
  assert.match(page, /<span key=\{i\} dir="ltr">\{pair\.map\(\(w, j\) => \[j \? <span key=\{"s" \+ j\}>\/<\/span> : null, <span key=\{j\} lang=\{w\.code\} dir=\{w\.dir\}>\{ocr\(w\.word\)\}<\/span>\]\)\}<\/span>/, "A/B, the slash its own run (Arabic keeps its direction), the Os zeros");
  assert.ok(!/SEX/.test(page), "SEX is IDNTY now");
  assert.match(page, /id="ppidnty" className="ppwrite" type="text" maxLength=\{32\} placeholder="—" value=\{info\.idnty \|\| ""\} onChange=\{\(e\) => onWrite\("idnty", e\.target\.value\)\}/, "IDNTY is free text the passenger writes");
  assert.match(css, /\.ppid dt, \.ppsig dt, \.ppacct dt \{[^}]*\}/, "the labels' face");
  assert.match(css, /\.ppid dt, \.ppsig dt, \.ppacct dt \{[^}]*font-size: var\(--pt-1\);[^}]*white-space: nowrap; \}/, "the labels on the legible scale, one line each: the photo narrowed to make the room (owner, 2 Nov 2026)");
  assert.match(css, /\.ppid dt em, \.ppsig dt em, \.ppacct dt em \{[^}]*font-size: var\(--pt-2\);/, "the translation a step smaller");
  assert.match(css, /--pt-2: 1\.7cqw; --pt-1: 2\.03cqw; --pt0: 2\.6cqw; --pt1: 3\.64cqw; --pm: 2\.03cqw; --pmz: 2\.6cqw;/, "the type scale: half-steps of φ from 1.6, legible as an ID's (owner, 2 Nov 2026)");
  assert.match(css, /--pp-cloud: color-mix\(in srgb, var\(--wm-bar\) 22%, transparent\);/, "the band a low-opacity solid white");
  assert.match(css, /\n\.ppcloud \{ position: absolute; inset: 0; z-index: 2; pointer-events: none; background: var\(--pp-cloud\);/, "solid: no wisps");
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
  assert.match(page, /const \{ surname, given \} = nameParts\(info\.name\);/);
  assert.match(board, /const mrz = mrzZone\(\{ uid, name: pinfo\.name, dob: pinfo\.dob, nationality: pinfo\.origin, idnty: pinfo\.idnty, taste, since: pinfo\.since \}\);/);
  assert.match(preview, /const mrz = mrzZone\(\{ uid, name: info\.name, dob: info\.dob, nationality: info\.origin, idnty: info\.idnty, taste, since: info\.since \}\);/);
  assert.match(page, /<dd>\{surname\.toUpperCase\(\) \|\| "—"\}<\/dd>/);
  assert.match(page, /<dd>\{given\.toUpperCase\(\) \|\| "—"\}<\/dd>/);
  assert.match(page, /<dd>\{info\.origin \|\| "—"\}<\/dd>/);
  assert.match(page, /<dd><span className="ppstar">\*<\/span> \{taste\}<\/dd>/);
  assert.match(page, /<dd>\{sinceDisplay\(info\.since\)\}<\/dd>/);
  assert.match(page, /<dd>\{uid \|\| "—"\}<\/dd>/);
  assert.match(page, /\{mrz\.map\(\(line, i\) => <MrzLine key=\{i\} text=\{line\} cursor=\{editable && i === mrz\.length - 1\} \/>\)\}/);
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
  assert.match(sig, /\{editable && <div className="ppsigkeys">/, "the keys only where the passenger can sign (the preview prints)");
  assert.match(css, /\.ppsigpad \{[^}]*touch-action: none;/, "the page does not scroll under the stroke");
  assert.match(css, /\.ppsignink \{[^}]*background: currentColor;/);
});

test("the bar code is the logo's brick mirrored: the logo's line, slant and bends, the bars cut out of it; thin", () => {
  const logo = brickGeometry(), g = barcodeGeometry();
  assert.equal(BARCODE_H, +(logo.foot - logo.top).toFixed(3), "the brick's own depth");
  assert.equal(g.thick, logo.thick, "the logo's line"); assert.equal(g.bend, logo.bend, "the logo's bends");
  const run = (g.toe - g.shoulder) / (g.line - g.top), logoRun = (logo.toe - logo.shoulder) / (logo.line - logo.top);
  assert.ok(Math.abs(run - logoRun) < 1e-3, "the logo's slant: " + run + " vs " + logoRun);
  assert.equal(g.toe + g.bend + g.tail, BARCODE_W, "the line runs to the box's far edge");
  assert.ok(BARCODE_W / BARCODE_H > 11, "thin: the box over eleven times wider than deep");
  assert.match(barcodePath(), /^M0 0 H/, "the brick's path (lib/wordmark.js brickPath), from the block's edge");
  const a = bars(bearer.uid), b = bars(bearer.uid), c = bars("u-00000000-0000-0000-0000-000000000001");
  assert.deepEqual(a, b, "stable");
  assert.notDeepEqual(a, c, "another account, another code");
  for (const [x, w] of a) { assert.ok(x >= 24 && x + w <= g.shoulder - 24, `bar at ${x} wide ${w} inside the block`); assert.ok(w >= 10 && w <= 34); }
  const svg = strip(read("app/components/PassportBarcode.jsx"));
  assert.match(svg, /<g transform=\{`matrix\(-1 0 0 1 \$\{BARCODE_W\} 0\)`\}>/, "mirrored: the line in from the left, the block at the right");
  assert.match(svg, /<mask id=\{cut\} maskUnits="userSpaceOnUse"/);
  assert.match(svg, /<rect key=\{i\} className="ppbarhole" x=\{x\} y=\{0\} width=\{w\} height=\{BARCODE_H\} \/>/, "every bar a hole");
  assert.match(svg, /<path className="ppbarplate" d=\{barcodePath\(\)\} mask=\{`url\(#\$\{cut\}\)`\} \/>/, "the plate drawn through the mask");
  assert.match(page, /<PassportBarcode uid=\{uid\} \/>/);
  assert.match(css, /\n\.ppbarplate \{ fill: var\(--wm-bar\); \}/, "the logo's white, unlit: no halo to read as a line");
  assert.ok(!/ppbartint|wm-cut-tint/.test(css.slice(css.indexOf("THE TASTE PASSPORT"), css.indexOf("THE DEVICE'S MACHINE-READABLE LINE"))) && !/ppbartint/.test(svg), "nothing in the slits but the glass: no tint, no ink");
  assert.match(css, /\.ppbarcode \{[^}]*height: var\(--pg1\);/, "φ¹ (8.09 hundredths of the page) deep");
  assert.match(css, /--pg-3: 1\.18cqw; --pg-2: 1\.91cqw; --pg-1: 3\.09cqw; --pg0: 5cqw; --pg1: 8\.09cqw; --pg2: 13\.09cqw; --pg3: 21\.18cqw; --pg4: 34\.27cqw; --pg5: 55\.45cqw;/, "the golden grid from the margin's unit");
  assert.match(css, /\.ppmast \{[^}]*height: var\(--pg2\);/, "the masthead φ² deep");
  assert.match(css, /\.ppid \{[^}]*width: var\(--pg5\);[^}]*grid-auto-rows: var\(--pg1\);/, "the fields φ⁵ wide at a φ¹ pitch");
  assert.match(css, /--pp-photo: calc\(100cqw - 2 \* var\(--pg0\) - var\(--pg5\) - var\(--pg-1\)\);/, "the photo the rest of the content (31.46)");
  assert.match(css, /\.ppphoto \{[^}]*width: var\(--pp-photo\); height: calc\(var\(--pp-photo\) \* 1\.618\);/, "a golden rectangle");
  assert.match(css, /\.pplow \{[^}]*width: calc\(100cqw - 2 \* var\(--pg0\) - var\(--pg3\) - var\(--pg-1\)\);/, "the signature and the account at the left of the lower page, the ghost beside");
  assert.match(css, /\n\.pplow \.ppsig dt \{ white-space: normal; \}/, "a Latin signature label may fold beside the ghost; the fields never");
  assert.match(css, /\.ppghost \{[^}]*width: var\(--pg3\); height: var\(--pg4\);/, "the ghost a golden rectangle, φ³ by φ⁴");
  assert.ok(BARCODE_W / BARCODE_H > 11.1 && BARCODE_W / BARCODE_H < 11.15, "the brick's box 90 by 8.09");
});

test("the cloud over the masthead only, its foot on the logo's slant; the zone unclouded and even; the map very faint; nothing else of the old artwork", () => {
  assert.match(css, /\n\.ppcloud \{ position: absolute; inset: 0; z-index: 2; pointer-events: none;/);
  assert.match(css, /\.ppcloud \{[^}]*backdrop-filter: blur\(2\.2px\) saturate\(160%\);/s);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{ \.ppcloud \{ -webkit-backdrop-filter: none; backdrop-filter: none; \} \}/);
  assert.match(css, /\.ppmast \.ppserial, \.ppmast \.ppnum \{ position: absolute; z-index: 1; opacity: var\(--pp-under\); color: var\(--sig\); text-shadow: var\(--glow\);/, "under the cloud, lower, glowing a little");
  assert.equal((page.match(/className="ppcloud"/g) || []).length, 1, "one cloud, on the masthead");
  assert.ok(/<span className="ppcloud" aria-hidden="true" \/>\s*<\/header>/.test(page), "over the masthead");
  // the masthead's foot: level at φ¹ of its φ² depth (8.09 of 13.09: 61.8%), then one unit down the logo's run to
  // the full depth
  assert.match(css, /\.ppmast \{[^}]*filter: drop-shadow\(0 0 0\.5cqw color-mix\(in srgb, var\(--wm-bar\) 70%, transparent\)\)/s, "the masthead glows white, the logo's white");
  const poly = css.match(/\.ppmast \.ppcloud \{ clip-path: polygon\(([^)]*)\)/s)[1].split(",").map((p) => p.trim().split(" ").map(parseFloat));
  const level = poly[poly.length - 1], toeEnd = poly[3];
  assert.deepEqual(level, [0, 61.8]); assert.deepEqual(toeEnd, [80.31, 100]);
  const logo = brickGeometry(), run = (logo.toe - logo.shoulder) / (logo.line - logo.top);
  const [sx, sy] = poly[10], [tx, ty] = poly[9]; // the slant's straight part, two points on it (in % of 100 by 13.09)
  const slope = ((tx - sx)) / ((ty - sy) * 13.09 / 100);
  assert.ok(Math.abs(slope - run) < 0.05, "the logo's slant: " + slope + " vs " + run);
  // the zone: two lines spread over the measure, Michroma, unclouded
  assert.match(css, /\.ppmrz \.mrzline \{ display: flex; justify-content: space-between;/, "every character a flex item: both lines end on one edge");
  assert.match(css, /\.ppmrz \.mrzline :is\(b, i\) \{ display: contents; \}/);
  assert.match(strip(read("app/components/Blocks.jsx")), /const chars = \(run\) => \[\.\.\.run\]\.map\(\(ch, j\) => <span key=\{j\}>\{ch\}<\/span>\);/);
  assert.match(css, /\n\.mrzline \{ display: block; white-space: nowrap; overflow: hidden; font-family: var\(--mich\); \}/, "the device's line Michroma by default; the Passport's zone sets OCR A");
  assert.ok(!/\.ppmrz[^{]*\{[^}]*--pp-under/.test(css) && !/ppminimrz/.test(css), "the zone is not clouded");
  assert.ok(!/var\(--mono\)/.test(css.slice(css.indexOf("THE TASTE PASSPORT"), css.indexOf("THE DEVICE'S MACHINE-READABLE LINE"))), "no mono face on the document");
  assert.match(css, /\n\.ppholo-a \{ opacity: 0\.09; \}/, "the map very, very faint");
  const sec = strip(read("app/components/PassportSecurity.jsx"));
  assert.ok(!/Plus|ppvpage|CROSSES|MICROPRINT|ppterrain|ppholo-b|pposm|OPENSTREETMAP/.test(sec), "no pluses, no page number, no window, no microprint, no credit line: the map alone");
  assert.ok(/OpenStreetMap/.test(read("app/map/page.js")), "the site still credits OpenStreetMap where the map is read in full");
  assert.match(page, /<span className="ppghostcap" aria-hidden="true">PASSENGER BIOMETRIC PHOTO<\/span>/, "the caption under the negative");
  assert.match(page, /<div className="pplow">\s*<PassportSignature[^>]*\/>\s*<dl className="ppacct">/, "the signature and the account in one flow, so a folded label moves the account down");
  assert.match(css, /\n\.pplow \{[^}]*display: grid; gap: var\(--pg-1\);/);
  assert.ok(!/ppholo-b|ppterrain|ppsummit|ppmicro|ppplate|ppnation|ppsec\b|ppvpage|pvplus|\.pv-[spr]/.test(css), "their rules gone");
  assert.ok(board.indexOf('<div className="ppdocacts">') > board.indexOf("</div>", board.indexOf('className="ppdoc lg"')), "the keys under the page, not on it");
});

test("the faces are the mock-up's: OCR A for the serial, the number and the four words; a serif numero; Michroma for the rest", () => {
  assert.match(css, /@font-face \{ font-family: "OCR A Extended"; src: url\("\/fonts\/ocr-a-extended\.ttf"\) format\("truetype"\); font-display: swap; \}/);
  assert.ok(readFileSync(new URL("../public/fonts/ocr-a-extended.ttf", import.meta.url)).length > 10000, "the face ships");
  assert.match(css, /--ocr: "OCR A Extended", "OCR A Std", var\(--mono\);/);
  assert.match(css, /--numero: "Times New Roman", Times, Georgia, serif;/);
  assert.match(css, /\.ppmast \.ppserial, \.ppmast \.ppserial b, \.ppmast \.ppserial i \{ font-family: var\(--ocr\); \}/);
  assert.match(css, /\.ppnum \{[^}]*font-family: var\(--ocr\); \}/);
  assert.match(css, /\.ppnum \.ppno \{[^}]*font-family: var\(--numero\);/);
  assert.match(css, /\.ppquad \{[^}]*font-family: var\(--ocr\);/);
  assert.match(css, /\.ppdoc \{[^}]*font-family: var\(--mich\);/s, "the page's face Michroma: the name, the labels, the values");
  assert.match(css, /\.ppmrz \.mrzline \{[^}]*font-family: var\(--ocr\);/, "the zone in OCR A");
});

test("the name: the logo's set, bigger and bolder, one line", () => {
  assert.match(page, /<h2 className="pptitle">ASILUM TASTE PASSPORT<\/h2>/);
  assert.match(css, /\.pptitle \{[^}]*letter-spacing: -0\.06em; -webkit-text-stroke: 0\.02em currentColor; color: var\(--ink\); text-shadow: none; \}/s, "the logo's set opened a little, half the stroke, the ink unlit");
  assert.match(css, /\.pptitle \{[^}]*white-space: nowrap;/s);
});

test("colour only through the tokens: no literal colour in the passport's components", () => {
  for (const f of ["app/components/PassportDocument.jsx", "app/components/PassportSignature.jsx", "app/components/PassportBarcode.jsx", "app/components/PassportSecurity.jsx", "app/components/PassportPreview.jsx", "app/components/Blocks.jsx"]) {
    const src = strip(read(f));
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(src), f + " carries a literal colour");
  }
  assert.match(css, /\.ppstar \{ color: var\(--warn\); text-shadow: var\(--glow-r\); \}/, "the data page's asterisk is the house red, glowing red");
});
