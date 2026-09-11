// lib/asterisk/culture/catalog-figures.js
// PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles
// every part IN ORDER and is the only module anything else imports.
//
// ORDER IS LOAD-BEARING. cultureIndex() lets a later record's name or alias
// overwrite an earlier one's, and cultureSuggestView() walks the array as it
// stands, so the sequence here is behaviour and not formatting. Add records to
// the END of the part they belong to; never reorder to tidy.
//
// INFLUENCERS, MODELS AND STYLE-CANON FIGURES.

import { P, P2, P3 } from "./provenance.js";

/** @type {import("./provenance.js").CultureRecord[]} */
export const FIGURES = [
  // ---- INFLUENCERS, MODELS & STYLE-CANON FIGURES ------------------------------
  { kind: "figure", name: "bella hadid", aliases: ["bella"],
    interpretations: [
      { id: "bella-hadid/street", label: "off-duty", type: "personal",
        summary: "vintage-hunted y2k street — archival denim, tiny shades, 90s sport layers",
        tags: ["archival", "streetwear", "seductive", "independent"],
        colors: ["brown", "blue", "grey"], moods: ["nocturnal", "raw"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "gigi hadid", aliases: ["gigi"],
    interpretations: [
      { id: "gigi-hadid/street", label: "off-duty", type: "personal",
        summary: "polished casual — blazers with denim, warm neutrals, model-schedule practicality",
        tags: ["tailored", "minimal", "streetwear"],
        colors: ["beige", "blue", "white"], moods: ["polished", "soft"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "kendall jenner", aliases: ["kendall"],
    interpretations: [
      { id: "kendall/street", label: "off-duty", type: "personal",
        summary: "clean model off-duty — straight denim, fitted tanks, precise minimalism",
        tags: ["minimal", "seductive", "tailored"],
        colors: ["black", "white", "beige"], moods: ["polished", "restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "hailey bieber", aliases: ["hailey"],
    interpretations: [
      { id: "hailey/street", label: "clean-girl street", type: "personal",
        summary: "the clean girl blueprint at street scale — oversized blazers, bike shorts, glazed polish",
        tags: ["minimal", "streetwear", "seductive"],
        colors: ["beige", "black", "cream"], moods: ["polished", "soft"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "kim kardashian", aliases: ["kim k"],
    interpretations: [
      { id: "kim-k/neutral-era", label: "sculpted neutral era", type: "era",
        summary: "bodycon neutrals, latex-smooth lines, monochrome sculpting",
        tags: ["minimal", "seductive", "statement"],
        colors: ["beige", "grey", "black"], moods: ["polished", "clinical"], confidence: 0.75, provenance: P2 },
      { id: "kim-k/glam-era", label: "2010s glam era", type: "era",
        summary: "contour-era bodycon glamour — heels always, shine everywhere",
        tags: ["seductive", "statement"],
        colors: ["black", "gold", "cream"], moods: ["polished", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "kylie jenner", aliases: ["kylie"],
    interpretations: [
      { id: "kylie/style", label: "Kylie", type: "personal",
        summary: "glam street — curve-first fits, designer accents, gloss-finish styling",
        tags: ["seductive", "statement", "streetwear"],
        colors: ["brown", "black", "pink"], moods: ["polished", "nocturnal"], confidence: 0.65, provenance: P2 }] },
  { kind: "figure", name: "zendaya", aliases: [],
    note: "largely stylist-directed red-carpet work — labeled as styling, not personal style, per the brief",
    interpretations: [
      { id: "zendaya/carpet", label: "red-carpet chameleon", type: "red-carpet",
        summary: "theme-fluent event dressing — era references executed at couture level (stylist-collaborative)",
        tags: ["statement", "avant-garde", "tailored", "seductive"],
        colors: ["red", "silver", "black"], moods: ["polished", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "timothee chalamet", aliases: ["timothée chalamet", "timmy"],
    interpretations: [
      { id: "chalamet/carpet", label: "soft avant carpet", type: "red-carpet",
        summary: "backless halters, sequined hoodies, harness details — soft androgyny at premieres",
        tags: ["avant-garde", "seductive", "statement", "tailored"],
        colors: ["black", "red", "silver"], moods: ["romantic", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "harry styles", aliases: [],
    interpretations: [
      { id: "harry-styles/style", label: "Harry Styles", type: "era",
        summary: "gender-fluid statement — pearls, flares, boas, painted nails on stage and street",
        tags: ["statement", "seductive", "avant-garde", "archival"],
        colors: ["pink", "blue", "cream"], moods: ["playful", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "jaden smith", aliases: ["jaden"],
    interpretations: [
      { id: "jaden/style", label: "Jaden", type: "personal",
        summary: "gender-fluid futurist street — skirts with hoodies, color experiments, message tees",
        tags: ["avant-garde", "streetwear", "independent", "statement"],
        colors: ["pink", "white", "black"], moods: ["playful", "ethereal"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "emma chamberlain", aliases: [],
    interpretations: [
      { id: "emma-chamberlain/style", label: "Emma Chamberlain", type: "personal",
        summary: "thrifted it-girl eclectic — vintage layers, unexpected proportions, coffee-run charisma",
        tags: ["independent", "archival", "statement"],
        colors: ["brown", "cream", "red"], moods: ["playful", "raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "matilda djerf", aliases: ["djerf"],
    interpretations: [
      { id: "djerf/style", label: "scandi girl", type: "personal",
        summary: "the blowout-and-blazer blueprint — cream knits, relaxed tailoring, Stockholm polish",
        tags: ["minimal", "tailored", "seductive"],
        colors: ["cream", "beige", "blue"], moods: ["soft", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "wisdom kaye", aliases: [],
    interpretations: [
      { id: "wisdom-kaye/style", label: "Wisdom Kaye", type: "personal",
        summary: "fashion-TikTok maximal tailoring — editorial color theory, runway references daily",
        tags: ["statement", "tailored", "avant-garde"],
        colors: ["red", "green", "navy"], moods: ["polished", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "alexa chung", aliases: [],
    interpretations: [
      { id: "alexa-chung/style", label: "indie it-girl", type: "era",
        summary: "peter-pan collars, ballet flats, mini dresses with mussed hair — 2008-2012 canon",
        tags: ["independent", "archival", "seductive"],
        colors: ["navy", "cream", "black"], moods: ["playful", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "kate moss", aliases: [],
    interpretations: [
      { id: "kate-moss/style", label: "90s off-duty", type: "era",
        summary: "rock-waif canon — skinny scarves, slip dresses, ballet flats with cigarette trousers",
        tags: ["seductive", "minimal", "independent", "archival"],
        colors: ["black", "grey", "gold"], moods: ["nocturnal", "raw"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "90s supermodels", aliases: ["supermodel off-duty", "supermodel style"],
    interpretations: [
      { id: "supermodels/off-duty", label: "off-duty canon", type: "era",
        summary: "high-waist denim, blazers, bodysuits and loafers — airport paparazzi gold standard",
        tags: ["minimal", "tailored", "seductive"],
        colors: ["blue", "black", "cream"], moods: ["polished", "raw"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "princess diana", aliases: ["diana", "lady di"],
    note: "historical style canon — readings by context",
    interpretations: [
      { id: "diana/off-duty", label: "off-duty athletic", type: "era",
        summary: "the bike-shorts-and-sweatshirt canon — collegiate crews, white sneakers, unbothered",
        tags: ["streetwear", "minimal", "archival"],
        colors: ["grey", "white", "navy"], moods: ["playful", "soft"], confidence: 0.8, provenance: P2 },
      { id: "diana/event", label: "event elegance", type: "red-carpet",
        summary: "shoulder-era gowns and the revenge-dress register — occasion dressing as statement",
        tags: ["tailored", "statement", "seductive", "archival"],
        colors: ["black", "red", "cream"], moods: ["polished", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "carolyn bessette-kennedy", aliases: ["carolyn bessette", "cbk"],
    interpretations: [
      { id: "cbk/style", label: "CBK minimal", type: "era",
        summary: "90s minimal canon — bias slips, straight coats, hair-tucked simplicity",
        tags: ["minimal", "tailored", "seductive"],
        colors: ["black", "cream", "navy"], moods: ["restrained", "polished"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "audrey hepburn", aliases: ["audrey"],
    interpretations: [
      { id: "audrey/style", label: "gamine minimal", type: "era",
        summary: "cigarette pants, boatnecks, ballet flats — precision worn light",
        tags: ["minimal", "tailored", "archival"],
        colors: ["black", "white", "beige"], moods: ["polished", "playful"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "jane birkin", aliases: [],
    interpretations: [
      { id: "birkin/style", label: "Birkin ease", type: "era",
        summary: "basket bags, worn denim, white tees — undone French-English effortlessness",
        tags: ["minimal", "independent", "seductive", "archival"],
        colors: ["blue", "white", "cream"], moods: ["soft", "romantic"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "steve mcqueen", aliases: [],
    interpretations: [
      { id: "mcqueen/style", label: "McQueen casual", type: "era",
        summary: "60s masculine ease — suede jackets, chinos, desert boots, racing sunglasses",
        tags: ["minimal", "utilitarian", "archival", "tailored"],
        colors: ["brown", "navy", "beige"], moods: ["restrained", "raw"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "paul newman", aliases: [],
    interpretations: [
      { id: "newman/style", label: "Newman ivy", type: "era",
        summary: "ivy casual canon — oxford shirts, chinos, a watch that became a category",
        tags: ["tailored", "minimal", "archival"],
        colors: ["blue", "cream", "grey"], moods: ["polished", "soft"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "james dean", aliases: [],
    interpretations: [
      { id: "james-dean/style", label: "rebel uniform", type: "era",
        summary: "the red-jacket-white-tee-denim trinity — the template of cool",
        tags: ["streetwear", "archival", "statement"],
        colors: ["red", "white", "blue"], moods: ["raw", "romantic"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "marlon brando", aliases: ["brando"],
    interpretations: [
      { id: "brando/style", label: "Brando biker", type: "era",
        summary: "perfecto leather, white tees, work trousers — menace made minimal",
        tags: ["streetwear", "archival", "seductive"],
        colors: ["black", "white", "blue"], moods: ["raw", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "david beckham", aliases: ["beckham"],
    interpretations: [
      { id: "beckham/casual-era", label: "football casual era", type: "era",
        summary: "the 90s-2000s experiments — sarongs to leathers, the blokecore source text",
        tags: ["streetwear", "statement", "archival"],
        colors: ["white", "blue", "black"], moods: ["playful", "raw"], confidence: 0.75, provenance: P2 },
      { id: "beckham/tailored-era", label: "tailored era", type: "era",
        summary: "the grown chapter — knit polos, flannel trousers, heritage-brand precision",
        tags: ["tailored", "minimal", "archival"],
        colors: ["navy", "grey", "brown"], moods: ["polished", "restrained"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "michael jordan", aliases: ["mj"],
    interpretations: [
      { id: "jordan/style", label: "90s MJ", type: "era",
        summary: "baggy earth-tone suits, mock necks, the sneakers that built an industry",
        tags: ["tailored", "statement", "archival", "streetwear"],
        colors: ["brown", "beige", "black"], moods: ["polished", "playful"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "allen iverson", aliases: ["the answer"],
    interpretations: [
      { id: "iverson/style", label: "AI era", type: "era",
        summary: "2000s NBA street canon — jerseys, durags, baggy denim, the culture shift the league dress-coded",
        tags: ["streetwear", "statement", "archival"],
        colors: ["white", "red", "blue"], moods: ["raw", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "dennis rodman", aliases: ["rodman"],
    interpretations: [
      { id: "rodman/style", label: "Rodman chaos", type: "era",
        summary: "90s statement anarchy — feather boas, crop tops, hair as a mood ring",
        tags: ["statement", "avant-garde", "independent", "seductive"],
        colors: ["pink", "green", "silver"], moods: ["playful", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "nba tunnel style", aliases: ["tunnel fits", "tunnel walk"],
    interpretations: [
      { id: "nba-tunnel/core", label: "tunnel fits", type: "aesthetic",
        summary: "the pregame runway — stylist-assisted statement dressing, arena hallway as catwalk",
        tags: ["statement", "streetwear", "tailored", "avant-garde"],
        colors: ["black", "red", "cream"], moods: ["polished", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "zoe kravitz", aliases: ["zoë kravitz"],
    interpretations: [
      { id: "zoe-kravitz/style", label: "rock minimal", type: "personal",
        summary: "tiny tanks, vintage leather, wire frames — inherited cool worn lightly",
        tags: ["minimal", "seductive", "independent", "archival"],
        colors: ["black", "brown", "white"], moods: ["nocturnal", "raw"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "teyana taylor", aliases: [],
    interpretations: [
      { id: "teyana/style", label: "Teyana", type: "personal",
        summary: "tomboy glam — oversized tailoring over bodysuits, Harlem swagger",
        tags: ["streetwear", "seductive", "tailored", "statement"],
        colors: ["black", "brown", "gold"], moods: ["aggressive", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "figure", name: "tracee ellis ross", aliases: [],
    interpretations: [
      { id: "tracee/style", label: "Tracee", type: "personal",
        summary: "joyful volume — sculptural color, prints worn fearless, beauty as celebration",
        tags: ["statement", "avant-garde", "seductive"],
        colors: ["red", "gold", "green"], moods: ["playful", "polished"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "iris apfel", aliases: [],
    interpretations: [
      { id: "iris-apfel/style", label: "Iris", type: "era",
        summary: "maximal eccentric canon — giant glasses, armfuls of bangles, more is more",
        tags: ["statement", "independent", "archival", "avant-garde"],
        colors: ["red", "gold", "blue"], moods: ["playful"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "anna wintour", aliases: [],
    interpretations: [
      { id: "wintour/style", label: "the uniform", type: "era",
        summary: "bob, dark glasses, printed sheath, statement necklace — decision fatigue eliminated",
        tags: ["tailored", "statement", "minimal"],
        colors: ["red", "beige", "navy"], moods: ["polished", "severe"], confidence: 0.8, provenance: P2 }] },
  { kind: "figure", name: "victoria beckham", aliases: ["posh spice"],
    interpretations: [
      { id: "vb/style", label: "VB tailoring", type: "era",
        summary: "posh-to-minimal arc — sharp trousers, silk shirts, restraint as reinvention",
        tags: ["tailored", "minimal", "seductive"],
        colors: ["navy", "cream", "black"], moods: ["polished", "restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "figure", name: "olsen twins", aliases: ["mary-kate and ashley", "mary kate olsen", "ashley olsen", "the row style"],
    interpretations: [
      { id: "olsens/style", label: "oversized luxe", type: "era",
        summary: "swallowed-by-cashmere silhouettes, giant sunglasses, boho-gone-monastic — the quiet-luxury source code",
        tags: ["minimal", "avant-garde", "archival", "tailored"],
        colors: ["black", "beige", "grey"], moods: ["restrained", "ethereal"], confidence: 0.8, provenance: P2 }] },

  // ---- FIVE ACTORS, THIRTY YEARS: OUTFIT BREAKDOWNS (owner, 10 Sep 2026) ----
  // Each look is broken into its PIECES, and each piece carries the
  // descriptors the stream writes on listings (lib/asterisk/stream), so a
  // reference and a piece meet on the same words: "dagger collar" on a 1997
  // Pacino and on a 1974 jacket a seller listed on Tuesday.
  { kind: "figure", name: "al pacino", aliases: ["pacino", "donnie brasco", "lefty ruggiero"],
    interpretations: [
      { id: "al-pacino/donnie-brasco", label: "Donnie Brasco (1997) — Lefty", type: "film",
        summary: "1970s Brooklyn wiseguy wardrobe: brown leather car coat over an open wide-collar shirt, gold at the neck and pinky, flared slacks",
        tags: ["seductive", "tailored", "archival"],
        colors: ["brown", "cream", "gold", "black"], moods: ["nocturnal", "worn-in"], confidence: 0.75, provenance: P2,
        pieces: [
          { piece: "brown leather car coat", descriptors: ["dagger collar", "brown leather", "hip length", "1970s", "aged leather", "metal zippers"], year: 1997 },
          { piece: "wide collar shirt", descriptors: ["butterfly collar", "open collar", "silky", "1970s", "cream"] },
          { piece: "flared slacks", descriptors: ["flare", "high rise", "wool", "pressed crease"] },
          { piece: "gold jewellery", descriptors: ["gold chain", "pinky ring", "gold watch"] },
        ] },
      { id: "al-pacino/carlito", label: "Carlito's Way (1993)", type: "film",
        summary: "black leather trench, dark shirts, a 1975 nightclub in every seam",
        tags: ["seductive", "statement", "archival"],
        colors: ["black", "burgundy"], moods: ["nocturnal", "severe"], confidence: 0.65, provenance: P2,
        pieces: [
          { piece: "black leather trench", descriptors: ["leather trench", "belted", "1970s", "black leather", "wide lapel"], year: 1993 },
          { piece: "dark silk shirt", descriptors: ["open collar", "silk", "black"] },
        ] } ] },
  { kind: "figure", name: "robert de niro", aliases: ["de niro", "travis bickle", "neil mccauley"],
    interpretations: [
      { id: "robert-de-niro/taxi-driver", label: "Taxi Driver (1976) — Travis Bickle", type: "film",
        summary: "an army-surplus wardrobe on a night shift: olive M-65 field jacket, plaid western shirt, straight jeans, engineer boots — 1976 New York after midnight",
        tags: ["utilitarian", "archival", "minimal"],
        colors: ["olive", "red", "blue", "black"], moods: ["nocturnal", "raw"], confidence: 0.8, provenance: P2,
        pieces: [
          { piece: "m-65 field jacket", descriptors: ["m-65", "field jacket", "olive", "military surplus", "1970s", "brass zipper"], year: 1976 },
          { piece: "plaid western shirt", descriptors: ["western shirt", "plaid", "snap buttons", "1970s"] },
          { piece: "straight jeans", descriptors: ["straight leg", "indigo", "1970s"] },
          { piece: "engineer boots", descriptors: ["engineer boots", "black leather", "buckle"] },
        ] },
      { id: "robert-de-niro/heat", label: "Heat (1995) — Neil McCauley", type: "film",
        summary: "the professional's grey: charcoal suits, open-collar shirts, nothing that catches — 1995 Los Angeles precision",
        tags: ["tailored", "minimal"],
        colors: ["grey", "charcoal", "white"], moods: ["restrained", "clinical"], confidence: 0.75, provenance: P2,
        pieces: [
          { piece: "charcoal suit", descriptors: ["charcoal", "two-button", "1990s", "wool", "single-breasted"], year: 1995 },
          { piece: "open collar shirt", descriptors: ["open collar", "white", "point collar"] },
        ] } ] },
  { kind: "figure", name: "jake gyllenhaal", aliases: ["gyllenhaal", "robert graysmith", "zodiac"],
    interpretations: [
      { id: "jake-gyllenhaal/zodiac", label: "Zodiac (2007) — Robert Graysmith", type: "film",
        summary: "1970s San Francisco newsroom: corduroy blazer with elbow patches, rib turtlenecks, wide spread collars, flared cords in mustard and brown",
        tags: ["tailored", "archival", "minimal"],
        colors: ["brown", "mustard", "olive", "cream"], moods: ["worn-in", "restrained"], confidence: 0.75, provenance: P2,
        pieces: [
          { piece: "corduroy blazer", descriptors: ["corduroy", "elbow patches", "1970s", "wide lapel", "brown"], year: 2007 },
          { piece: "rib turtleneck", descriptors: ["turtleneck", "rib knit", "mustard", "1970s"] },
          { piece: "spread collar shirt", descriptors: ["spread collar", "butterfly collar", "1970s", "cream"] },
          { piece: "flared cords", descriptors: ["corduroy", "flare", "high rise"] },
        ] } ] },
  { kind: "figure", name: "tom cruise", aliases: ["maverick", "pete mitchell"],
    interpretations: [
      { id: "tom-cruise/top-gun", label: "Top Gun (1986) — Maverick", type: "film",
        summary: "the G-1 flight jacket covered in squadron patches, white tee, aviators, straight jeans — 1986 in one silhouette",
        tags: ["utilitarian", "statement", "streetwear"],
        colors: ["brown", "white", "blue"], moods: ["sunlit", "polished"], confidence: 0.8, provenance: P2,
        pieces: [
          { piece: "g-1 flight jacket", descriptors: ["g-1", "flight jacket", "brown leather", "mouton collar", "squadron patches", "1980s"], year: 1986 },
          { piece: "aviator sunglasses", descriptors: ["aviator", "gold frame", "green lens"] },
          { piece: "white tee", descriptors: ["white tee", "crew neck"] },
          { piece: "straight jeans", descriptors: ["straight leg", "light wash", "1980s"] },
        ] },
      { id: "tom-cruise/collateral", label: "Collateral (2004) — Vincent", type: "film",
        summary: "grey on grey: a silver-grey suit, grey shirt, grey hair — a hitman dressed to disappear into 2004 Los Angeles",
        tags: ["tailored", "minimal"],
        colors: ["grey", "silver"], moods: ["nocturnal", "clinical"], confidence: 0.75, provenance: P2,
        pieces: [
          { piece: "grey suit", descriptors: ["grey", "two-button", "2000s", "slim lapel"], year: 2004 },
          { piece: "grey shirt", descriptors: ["grey", "open collar", "point collar"] },
        ] } ] },
  { kind: "figure", name: "jacob elordi", aliases: ["elordi", "felix catton"],
    interpretations: [
      { id: "jacob-elordi/saltburn", label: "Saltburn (2023) — Felix Catton, 2006", type: "film",
        summary: "2006 Oxford summer: rugby stripes, open linen shirts, low jeans, everything a little too big and worn like it costs nothing",
        tags: ["seductive", "independent", "minimal"],
        colors: ["white", "navy", "green", "blue"], moods: ["sunlit", "worn-in"], confidence: 0.7, provenance: P2,
        pieces: [
          { piece: "striped rugby shirt", descriptors: ["rugby shirt", "striped", "oversized", "2000s", "cotton"], year: 2023 },
          { piece: "open linen shirt", descriptors: ["linen", "open collar", "white", "slouchy"] },
          { piece: "low rise jeans", descriptors: ["low rise", "bootcut", "light wash", "2000s"] },
        ] },
      { id: "jacob-elordi/carpet", label: "2024–25 carpet — Bottega Veneta", type: "red-carpet",
        summary: "long-line Bottega tailoring, leather, a quiet-luxury frame on a very tall man",
        tags: ["tailored", "minimal", "seductive"],
        colors: ["black", "brown", "olive"], moods: ["polished", "restrained"], confidence: 0.7, provenance: P2,
        pieces: [
          { piece: "long-line overcoat", descriptors: ["long coat", "wool", "oversized", "bottega veneta"], year: 2024 },
          { piece: "leather jacket", descriptors: ["leather", "boxy", "black leather", "quiet luxury"] },
        ] } ] }
];
