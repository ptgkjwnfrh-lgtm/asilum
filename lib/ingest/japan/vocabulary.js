// lib/ingest/japan/vocabulary.js — READING A JAPANESE LISTING.
//
// ── WHY THIS IS A TABLE AND NOT A TRANSLATOR ────────────────────────────────
//
// ASTERISK may only reason from what it can point at. A machine translation of
// 「ヘルムートラング パンツ」 is a guess with no provenance — plausible, usually
// right, and unattributable when it is wrong. Every row below is instead an
// ARCHIVALIST MAPPING: a person wrote it down, and the row records who.
//
// That is slower and it is the point. When a mapping is wrong there is
// somebody to ask, and `unknown()` collects what the table could not read so a
// human can decide — the same shape lib/asterisk/unknownQueries.js already
// uses. Nothing here ever invents a reading.
//
// ── AND THE READING IS INVISIBLE (docs/INVISIBLE-MACHINERY.md) ──────────────
//
// There is no language control, no "translate this listing" button, and no
// flag icon. A reader searches "helmut lang trousers" and a Yahoo listing
// titled 「ヘルムートラング パンツ」 comes back, because the system READ it —
// not because anybody asked it to. A competitor can add a translate button in
// an afternoon; the label tells them what to build. What they cannot copy is a
// catalog that was already legible.
//
// ── SCRIPTS ─────────────────────────────────────────────────────────────────
//
// Japanese resale listings write brands in KATAKANA (ディオール), occasionally
// in latin (Dior), and often both in one title. Conditions and garments come in
// kanji and katakana. Matching is done on the raw string because katakana has
// no case and no accents to fold — `foldNorm` is for latin and is applied to
// the latin half only.

/** Who wrote a mapping down. Every entry carries one. */
export const ARCHIVALIST_SEED = "archivalist-seed-2026-08";

/**
 * Houses, in the script the listings actually use.
 *
 * Katakana only. The latin spellings already resolve through
 * lib/search/intent.js `resolveBrandSpelling`, and duplicating them here would
 * create a second register to keep in sync — the exact drift
 * lib/tagging/vocabulary.js exists to prevent.
 */
export const HOUSES = Object.freeze(Object.assign(Object.create(null), {
  "ディオール": "Dior",
  "プラダ": "Prada",
  "コムデギャルソン": "Comme des Garçons",
  "ヨウジヤマモト": "Yohji Yamamoto",
  "イッセイミヤケ": "Issey Miyake",
  "メゾンマルジェラ": "Maison Margiela",
  "マルジェラ": "Maison Margiela",
  "リックオウエンス": "Rick Owens",
  "バレンシアガ": "Balenciaga",
  "サンローラン": "Saint Laurent",
  "アンダーカバー": "Undercover",
  "ラフシモンズ": "Raf Simons",
  "ヘルムートラング": "Helmut Lang",
  "ジュンヤワタナベ": "Junya Watanabe",
  "ステューシー": "Stussy",
  "シュプリーム": "Supreme",
  "ストーンアイランド": "Stone Island",
  "アークテリクス": "Arc'teryx",
  "サカイ": "Sacai",
  "アクネストゥディオズ": "Acne Studios",
  "ロエベ": "Loewe",
  "ボッテガヴェネタ": "Bottega Veneta",
  "セリーヌ": "Celine",
  "ジルサンダー": "Jil Sander",
  "ルメール": "Lemaire",
  "カペタ": "Kapital",
  "ビズビム": "Visvim",
  "ニードルス": "Needles",
  "ナンバーナイン": "Number (N)ine",
  "アンリアレイジ": "Anrealage",
  "タカヒロミヤシタ": "TAKAHIROMIYASHITA",
  "ホワイトマウンテニアリング": "White Mountaineering",
}));

/**
 * Garment nouns → the `garment` facet in lib/tagging/vocabulary.js.
 *
 * The values are facet VALUES, not free text, so a Japanese listing lands on
 * exactly the axis an English one does and search cannot tell them apart.
 */
export const GARMENTS = Object.freeze(Object.assign(Object.create(null), {
  "ジャケット": "jacket",
  "ブルゾン": "blouson",
  "コート": "coat",
  "パンツ": "trouser",
  "スラックス": "trouser",
  "デニム": "denim",
  "ジーンズ": "denim",
  "シャツ": "shirt",
  "ニット": "knit",
  "セーター": "knit",
  "カーディガン": "cardigan",
  "スカート": "skirt",
  "ワンピース": "dress",
  "ブーツ": "boot",
  "スニーカー": "sneaker",
  "バッグ": "bag",
  "ベルト": "belt",
  "スカーフ": "scarf",
  "帽子": "hat",
}));

/**
 * Condition grades → the `condition` facet.
 *
 * Japanese resale has a far more precise condition vocabulary than English
 * listings do, and flattening it to "used" throws away the most reliable
 * information in the whole listing. 美品 is a real distinction from 中古 and a
 * reader who cares about archive pieces cares about exactly that difference.
 */
export const CONDITIONS = Object.freeze(Object.assign(Object.create(null), {
  "新品未使用": "new",
  "新品": "new",
  "未使用": "unused",
  "未使用に近い": "near-unused",
  "美品": "excellent",
  "中古": "used",
  "ジャンク": "for-parts",
  "訳あり": "flawed",
  "傷あり": "damaged",
  "汚れあり": "stained",
  "Aランク": "excellent",
  "Bランク": "used",
  "Cランク": "flawed",
}));

/** Department words → the `gender` facet. A shelf fact, never a claim. */
export const DEPARTMENTS = Object.freeze(Object.assign(Object.create(null), {
  "メンズ": "mens",
  "レディース": "womens",
  "ユニセックス": "unisex",
}));

/**
 * WHAT THE SELLER SAYS ABOUT AUTHENTICITY — and it is a CLAIM, never a fact.
 *
 * Two directions, and the second is the useful one:
 *
 *   asserted  the seller says it is genuine (正規品, 本物). Worth nothing on
 *             its own — anybody can type it — and recorded only so we never
 *             mistake it for verification.
 *   declared  THE SELLER SAYS IT IS NOT (コピー品, レプリカ, 偽物). That is
 *             real evidence, because it is an admission against interest, and
 *             it is the strongest authenticity signal that can be read from a
 *             listing without touching the garment.
 *
 * The second feeds lib/authenticity/evidence.js. Reading it is not a guess:
 * the seller wrote it.
 */
export const AUTHENTICITY_CLAIMS = Object.freeze(Object.assign(Object.create(null), {
  "正規品": "asserted",
  "本物": "asserted",
  "本物保証": "asserted",
  "国内正規": "asserted",
  "コピー品": "declared-replica",
  "コピー": "declared-replica",
  "レプリカ": "declared-replica",
  "偽物": "declared-replica",
  "スーパーコピー": "declared-replica",
}));


/**
 * Materials → the `material` facet.
 *
 * Japanese listings name the fabric far more consistently than English resale
 * does, because it is a legal labelling habit rather than a marketing choice.
 */
export const MATERIALS = Object.freeze(Object.assign(Object.create(null), {
  "シルク": "silk",
  "ウール": "wool",
  "コットン": "cotton",
  "レザー": "leather",
  "ラムレザー": "leather",
  "ナイロン": "nylon",
  "カシミヤ": "cashmere",
  "リネン": "linen",
  "ポリエステル": "polyester",
  "スエード": "suede",
  "ダウン": "down",
  "ツイード": "tweed",
  "コーデュロイ": "corduroy",
}));

/**
 * Colours → a MERCHANT COLOUR CLAIM, and deliberately not the `color` facet.
 *
 * This is the seller saying what colour the piece is, which is exactly the
 * input lib/ingest/colorEvidence.js already treats as a claim to be checked
 * against the listing photographs. A katakana colour word is worth no more
 * than an English one — it goes through the same corroboration, and only
 * survives as `verified` if the images agree.
 *
 * Feeding it straight into the `color` facet would let a Japanese listing
 * assert a colour an English one would have had to prove.
 */
export const COLORS = Object.freeze(Object.assign(Object.create(null), {
  "ブラック": "black",
  "ホワイト": "white",
  "ネイビー": "navy",
  "グレー": "grey",
  "ベージュ": "beige",
  "ブラウン": "brown",
  "レッド": "red",
  "ブルー": "blue",
  "グリーン": "green",
  "ピンク": "pink",
  "イエロー": "yellow",
  "パープル": "purple",
  "シルバー": "silver",
  "ゴールド": "gold",
  "カーキ": "khaki",
  "アイボリー": "ivory",
}));

/** Words that mean the piece is old stock, not a current-season item. */
export const ARCHIVE_WORDS = Object.freeze(["古着", "アーカイブ", "ヴィンテージ", "ビンテージ"]);

/** Every table, so a reader can be told what the register covers. */
export const TABLES = Object.freeze({
  HOUSES, GARMENTS, MATERIALS, COLORS, CONDITIONS, DEPARTMENTS, AUTHENTICITY_CLAIMS,
});
