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
        colors: ["black", "beige", "grey"], moods: ["restrained", "ethereal"], confidence: 0.8, provenance: P2 }] }
];
