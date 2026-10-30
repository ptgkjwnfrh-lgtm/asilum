// lib/model/pieces.js — THE MODEL'S PIECES (owner, 25 Oct 2026: "this is
// just a model so pepco can see what the app looks like … white background
// images of designer pieces, luxury furniture, luxury watches, jewellery,
// vintage records … a feed for an Oasis, Fontaines D.C., Hedi Slimane, indie
// sleaze, Justice fan who likes Eames and industrial furniture").
//
// WHAT THESE ARE. Demo records in the seed catalog's own shape (lib/ingest/
// catalog.js), so the brain scores them and the Feed draws them like any
// listing — and the card still prints DEMO · sample data, not for sale
// (lib/social.js isDemoItem: no live source URL). A record carries NO
// photograph: every piece wears a dark blue still (stills.js, demoImageFor
// below) at the owner's word. Nothing can be bought.
//
// Isomorphic: plain data, safe in the client bundle.

/** The reader the model is built for. The Feed overlays this taste on a cold
 *  reader of a keyless run (app/api/feed/route.js), the way a prompt would;
 *  it is never persisted. */
export const MODEL_PERSONA = Object.freeze({
  name: "the model's reader",
  prompt: "oasis britpop fontaines dc hedi slimane dior homme saint laurent indie sleaze justice eames industrial furniture vinyl records",
  tags: Object.freeze({ ARCHIVAL: 0.9, TAILORED: 0.6, STATEMENT: 0.5, MINIMAL: 0.45, INDEPENDENT: 0.4, SEDUCTIVE: 0.3 }),
});

const SEED = "Asilum synthetic seed";
// listed newest first — the Feed's catalog lane walks the listing in that
// order, so the model's pieces lead a keyless run
const day = (n) => new Date(Date.UTC(2026, 9, 24, 12, 0, 0) - n * 3600_000).toISOString();

const piece = (n, brand, title, price, category, img, alt, tags, extra = {}) => ({
  id: `model-${String(n).padStart(2, "0")}`,
  title: `${brand} — ${title}`, brand, price, currency: "USD",
  tags, designers: [brand], category,
  era: extra.era || { year: 2024, season: null, decade: "2020s", raw: null },
  size: extra.size ? { label: extra.size, system: extra.system || "IT", gender: extra.gender || "mens", fitsLikeUS: extra.fitsLikeUS || extra.size, runsBias: 0, measurements: {} } : null,
  img: null, alt, source: SEED, source_name: SEED,
  created_at: day(n),
});

export const MODEL_PIECES = Object.freeze([
  // the Hedi years — Dior Homme, Saint Laurent, Celine: skinny, black, done
  piece(1, "Saint Laurent", "L01 classic motorcycle jacket, black lambskin", 4990, "outerwear", "leather-jacket", "A black leather motorcycle jacket on white", { ARCHIVAL: 0.8, SEDUCTIVE: 0.6, STATEMENT: 0.5 }, { size: "48", era: { year: 2013, season: "Fall/Winter", decade: "2010s", raw: "Fall/Winter 2013" } }),
  piece(2, "Dior Homme", "black wool overcoat", 2400, "outerwear", "coat-black", "A black wool overcoat on white", { TAILORED: 0.8, MINIMAL: 0.6, ARCHIVAL: 0.5 }, { size: "46", era: { year: 2006, season: "Fall/Winter", decade: "2000s", raw: "Fall/Winter 2006" } }),
  piece(3, "Celine", "Chelsea boot, black calfskin", 1250, "footwear", "chelsea-pair", "A pair of black Chelsea boots on white", { MINIMAL: 0.7, TAILORED: 0.5, ARCHIVAL: 0.4 }, { size: "42", system: "EU", fitsLikeUS: "9" }),
  piece(4, "Saint Laurent", "Wyatt 40 boot, black", 1150, "footwear", "black-boots", "Black leather boots on white", { SEDUCTIVE: 0.6, ARCHIVAL: 0.5, STATEMENT: 0.4 }, { size: "42", system: "EU", fitsLikeUS: "9" }),
  piece(5, "Dior Homme", "denim western shirt", 590, "tops", "denim-shirt", "A dark denim western shirt on white", { ARCHIVAL: 0.6, UTILITARIAN: 0.5, MINIMAL: 0.3 }, { size: "M", system: "US" }),
  piece(6, "Helmut Lang", "white tee, 1998", 160, "tops", "white-tee", "A plain white t-shirt on white", { MINIMAL: 0.9, ARCHIVAL: 0.6 }, { size: "M", system: "US", era: { year: 1998, season: null, decade: "1990s", raw: "1998" } }),
  piece(7, "Raf Simons", "black tee, archive", 390, "tops", "black-tee", "A plain black t-shirt on white", { ARCHIVAL: 0.8, MINIMAL: 0.6, "AVANT-GARDE": 0.4 }, { size: "M", system: "US" }),
  // the Oasis side — the Breton, the camel coat, the bucket-hat decade
  piece(8, "Saint James", "Breton stripe, Oasis era", 140, "knitwear", "sweater-stripe", "A striped knit sweater on white", { UTILITARIAN: 0.7, ARCHIVAL: 0.6 }, { size: "L", system: "US", era: { year: 1996, season: null, decade: "1990s", raw: "1996" } }),
  piece(9, "Margaret Howell", "camel wool coat", 1290, "outerwear", "coat-brown", "A camel wool coat on white", { TAILORED: 0.7, MINIMAL: 0.6, UTILITARIAN: 0.3 }, { size: "M", system: "UK" }),
  piece(10, "Missoni", "zigzag knit", 890, "knitwear", "knit-blue", "A blue patterned knit on white", { STATEMENT: 0.6, ARCHIVAL: 0.5 }, { size: "48" }),
  piece(11, "Acne Studios", "pink wool coat", 1400, "outerwear", "coat-pink", "A pink wool coat on white", { STATEMENT: 0.7, MINIMAL: 0.4 }, { size: "36", system: "EU", gender: "womens", fitsLikeUS: "6" }),
  piece(12, "Prada", "Monolith chunky boot", 1550, "footwear", "chunky-boot", "A black chunky-soled boot on white", { STATEMENT: 0.7, STREETWEAR: 0.5, "AVANT-GARDE": 0.4 }, { size: "41", system: "EU", fitsLikeUS: "8" }),
  piece(13, "Church's", "oxblood derby", 620, "footwear", "red-shoes", "A pair of oxblood leather shoes on white", { TAILORED: 0.8, ARCHIVAL: 0.5 }, { size: "9", system: "UK", fitsLikeUS: "10" }),
  // indie sleaze — the shades
  piece(14, "Ray-Ban", "Wayfarer, red", 180, "accessories", "sunglasses-red", "Red-framed sunglasses on white", { STATEMENT: 0.7, ARCHIVAL: 0.5, STREETWEAR: 0.3 }),
  piece(15, "Ray-Ban", "Aviator, silver", 190, "accessories", "sunglasses-aviator", "Silver aviator sunglasses on white", { ARCHIVAL: 0.6, STATEMENT: 0.4 }),
  piece(16, "Cutler and Gross", "0847 frames", 420, "accessories", "frames", "Rectangular glasses frames on white", { MINIMAL: 0.6, TAILORED: 0.4 }),
  // the watches
  piece(17, "Rolex", "Submariner ref. 14060", 9800, "watches", "submariner", "A steel dive watch with a black dial on white", { ARCHIVAL: 0.8, TAILORED: 0.5, UTILITARIAN: 0.4 }),
  piece(18, "Rolex", "GMT-Master, 'Pepsi' bezel", 17500, "watches", "watch-gmt", "A steel watch with a red and blue bezel on white", { ARCHIVAL: 0.8, STATEMENT: 0.6 }),
  piece(19, "Cartier", "Tank Louis, steel", 3900, "watches", "tank", "A rectangular steel dress watch on a leather strap", { TAILORED: 0.8, MINIMAL: 0.7, ARCHIVAL: 0.5 }),
  piece(20, "Omega", "Speedmaster Professional", 7100, "watches", "speedmaster", "A black-dial chronograph on a steel bracelet", { ARCHIVAL: 0.7, UTILITARIAN: 0.6 }),
  piece(21, "Cartier", "Santos, yellow gold", 24000, "watches", "watch-gold", "A gold square-cased watch on white", { STATEMENT: 0.7, TAILORED: 0.6, SEDUCTIVE: 0.3 }),
  piece(22, "Audemars Piguet", "Royal Oak 15202", 68000, "watches", "watch-steel", "A steel octagonal-bezel watch on a steel bracelet", { STATEMENT: 0.8, TAILORED: 0.5, ARCHIVAL: 0.5 }),
  piece(23, "Omega", "Railmaster, white dial", 5200, "watches", "watch-white", "A white-dial watch on a leather strap on white", { MINIMAL: 0.7, UTILITARIAN: 0.5, ARCHIVAL: 0.4 }),
  // the jewellery
  piece(24, "Van Cleef & Arpels", "emerald and diamond halo ring", 6800, "jewellery", "ring-emerald", "An emerald ring with a diamond halo on white", { STATEMENT: 0.7, SEDUCTIVE: 0.5, ARCHIVAL: 0.5 }),
  piece(25, "Harry Winston", "diamond cluster ring", 4200, "jewellery", "ring-halo", "A diamond cluster ring on white", { SEDUCTIVE: 0.6, STATEMENT: 0.5, ARCHIVAL: 0.4 }),
  piece(26, "Tiffany & Co.", "classic band", 1100, "jewellery", "ring-band", "A plain metal band ring on white", { MINIMAL: 0.8, TAILORED: 0.3 }),
  piece(27, "Tiffany & Co.", "open heart pendant", 450, "jewellery", "necklace-heart", "A silver open-heart pendant on a chain", { MINIMAL: 0.5, SEDUCTIVE: 0.5 }),
  piece(28, "Bulgari", "18k curb chain", 2900, "jewellery", "chain-gold", "A gold chain necklace on white", { STATEMENT: 0.6, STREETWEAR: 0.5, ARCHIVAL: 0.4 }),
  piece(29, "Mikimoto", "Akoya pearl strand", 3600, "jewellery", "pearls", "A strand of white pearls on white", { TAILORED: 0.6, SEDUCTIVE: 0.5, ARCHIVAL: 0.5 }),
  piece(30, "Chrome Hearts", "silver cross chain", 320, "jewellery", "cross-chain", "A silver cross on a chain on white", { STATEMENT: 0.5, ARCHIVAL: 0.5, INDEPENDENT: 0.4 }),
  // the records and the decks
  piece(31, "Oasis", "Definitely Maybe, 1994 UK pressing", 220, "records", "record-orange", "A vinyl record on an orange ground", { ARCHIVAL: 0.9, INDEPENDENT: 0.5, STATEMENT: 0.4 }, { era: { year: 1994, season: null, decade: "1990s", raw: "1994" } }),
  piece(32, "Justice", "†, 2007 first pressing", 180, "records", "record-black", "A black vinyl record, close", { ARCHIVAL: 0.8, "AVANT-GARDE": 0.5, STATEMENT: 0.5 }, { era: { year: 2007, season: null, decade: "2000s", raw: "2007" } }),
  piece(33, "Technics", "SL-1200 MK2", 1400, "audio", "technics", "A silver direct-drive turntable", { UTILITARIAN: 0.8, ARCHIVAL: 0.7 }, { era: { year: 1979, season: null, decade: "1970s", raw: "1979" } }),
  piece(34, "Rega", "Planar 3", 900, "audio", "turntable-open", "A turntable with its lid open", { MINIMAL: 0.7, UTILITARIAN: 0.5 }),
  // Eames and iron
  piece(35, "Herman Miller", "Eames Lounge Chair and Ottoman", 6400, "furniture", "lounge-chair", "A moulded plywood and leather lounge chair with its ottoman", { ARCHIVAL: 0.9, TAILORED: 0.5, MINIMAL: 0.5 }, { era: { year: 1956, season: null, decade: "1950s", raw: "1956" } }),
  piece(36, "Herman Miller", "Eames LCW, walnut", 1900, "furniture", "plywood-chair", "A moulded plywood lounge chair on white", { ARCHIVAL: 0.8, MINIMAL: 0.7 }, { era: { year: 1946, season: null, decade: "1940s", raw: "1946" } }),
  piece(37, "Vitra", "Eames DCM", 1100, "furniture", "dcm-chair", "A moulded plywood dining chair on a chrome frame", { MINIMAL: 0.8, ARCHIVAL: 0.6 }),
  piece(38, "Tolix", "Chaise A, raw steel", 380, "furniture", "tolix-steel", "A raw steel café chair on white", { UTILITARIAN: 0.9, ARCHIVAL: 0.5, MINIMAL: 0.4 }),
  piece(39, "Tolix", "Chaise A, yellow", 340, "furniture", "tolix-yellow", "A yellow steel café chair on white", { UTILITARIAN: 0.8, STATEMENT: 0.5 }),
  piece(40, "Xavier Pauchard", "Chaise A, white (early Tolix)", 340, "furniture", "tolix-white", "A white steel café chair on white", { UTILITARIAN: 0.8, MINIMAL: 0.6 }),
  piece(41, "Industrial", "cage lantern, iron", 260, "lighting", "lantern", "An iron cage lantern on white", { UTILITARIAN: 0.9, ARCHIVAL: 0.5 }),
  piece(42, "Holophane", "brass lantern", 310, "lighting", "lantern-brass", "A brass lantern on white", { UTILITARIAN: 0.7, ARCHIVAL: 0.6 }),
  // the bags
  piece(43, "Celine", "Trio, white", 1100, "accessories", "bag-white", "A white leather bag on white", { MINIMAL: 0.9, TAILORED: 0.4 }),
  piece(44, "Alaïa", "mesh bucket bag", 1900, "accessories", "bag-mesh", "A black mesh bucket bag on white", { STATEMENT: 0.6, SEDUCTIVE: 0.5, "AVANT-GARDE": 0.4 }),
  piece(45, "The Row", "Park tote", 1500, "accessories", "tote-nude", "A nude leather tote on white", { MINIMAL: 0.9, TAILORED: 0.5 }),
]);

/** A demo piece's picture is its own coloured placeholder card (lib/client.js
 *  thumbFor — the initials, the tag); nothing is lent. Kept as the one place
 *  the Feed and the LISTING popup ask, so the answer can change in one line. */
export function demoImageFor(item) {
  // (owner, last: "bring back the original multi-coloured cards") the piece's
  // own placeholder card, lib/client.js thumbFor, is the picture — nothing lent
  return item ? null : null;
}

