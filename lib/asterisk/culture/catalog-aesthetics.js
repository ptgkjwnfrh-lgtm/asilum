// lib/asterisk/culture/catalog-aesthetics.js
// PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles
// every part IN ORDER and is the only module anything else imports.
//
// ORDER IS LOAD-BEARING. cultureIndex() lets a later record's name or alias
// overwrite an earlier one's, and cultureSuggestView() walks the array as it
// stands, so the sequence here is behaviour and not formatting. Add records to
// the END of the part they belong to; never reorder to tidy.
//
// THE JULY 2026 RESEARCH PASS: current aesthetics, alias networks, and trend
// phases that carry a lastReviewed date so staleness is auditable.

import { P, P2, P3 } from "./provenance.js";

/** @type {import("./provenance.js").CultureRecord[]} */
export const AESTHETICS = [
  // ==== EXPANSION pt3 (researched 2026-07): current aesthetics, ============
  // ==== alias networks, honest trend phases =================================
  { kind: "aesthetic", name: "opium", aliases: ["opiumcore", "opium style", "vamp", "rage aesthetic"],
    interpretations: [
      { id: "opium/core", label: "opium", type: "aesthetic",
        summary: "all-black rockstar armor — fitted tanks, super-flared leather, studded belts, oxidized silver crosses, futuristic shades",
        tags: ["avant-garde", "statement", "independent", "seductive"],
        colors: ["black", "silver"], moods: ["nocturnal", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "aesthetic", name: "office siren", aliases: ["corp-core", "corpcore", "girlboss 2.0", "office core"],
    interpretations: [
      { id: "office-siren/core", label: "office siren", type: "aesthetic",
        summary: "90s-y2k corporate sensuality — pencil skirts, thin-frame glasses, slicked buns, heels that mean business",
        tags: ["tailored", "seductive", "minimal"],
        colors: ["black", "grey", "white"], moods: ["polished", "severe"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "clean girl", aliases: ["clean girl aesthetic", "vanilla girl"],
    interpretations: [
      { id: "clean-girl/core", label: "clean girl", type: "aesthetic",
        summary: "slick bun, gold hoops, glowing skin, elevated neutral basics — polish that reads effortless",
        tags: ["minimal", "seductive"],
        colors: ["cream", "beige", "white"], moods: ["polished", "soft"], confidence: 0.8, provenance: P2 }] },
  { kind: "aesthetic", name: "pilates princess", aliases: ["princess pilates"],
    interpretations: [
      { id: "pilates-princess/core", label: "pilates princess", type: "aesthetic",
        summary: "matching pastel sets, ballet flats after class, matcha-in-hand curation",
        tags: ["minimal", "seductive"],
        colors: ["pink", "cream", "grey"], moods: ["soft", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "gym goblin", aliases: ["goblin mode gym"],
    interpretations: [
      { id: "gym-goblin/core", label: "gym goblin", type: "aesthetic",
        summary: "battered sneakers, oversized collegiate knits, deliberately mismatched layers — Diana-on-a-bike energy",
        tags: ["utilitarian", "independent", "archival"],
        colors: ["grey", "navy"], moods: ["raw", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "boho revival", aliases: ["bold boho", "boho chic", "bohemian", "boho"],
    interpretations: [
      { id: "boho-revival/core", label: "bold boho", type: "aesthetic",
        summary: "fringe, crochet, clashing prints, craft-led statement pieces — free-spirited but deliberate",
        tags: ["independent", "statement", "archival", "gorp"],
        colors: ["brown", "orange", "cream"], moods: ["playful", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "acubi", aliases: ["acubi style", "acubi fashion"],
    interpretations: [
      { id: "acubi/core", label: "acubi", type: "aesthetic",
        summary: "slim top over baggy bottom, cool grey tones, clean asymmetric details — Seoul minimal futurism",
        tags: ["minimal", "avant-garde", "streetwear"],
        colors: ["grey", "black", "white"], moods: ["clinical", "soft"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "downtown girl", aliases: ["downtown aesthetic"],
    interpretations: [
      { id: "downtown-girl/core", label: "downtown girl", type: "aesthetic",
        summary: "vintage leather, headphones, loafers, café-to-gallery layers — autumnal city romance",
        tags: ["independent", "archival", "minimal", "seductive"],
        colors: ["brown", "black", "cream"], moods: ["romantic", "nocturnal"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "tomato girl", aliases: ["tomato girl summer"],
    interpretations: [
      { id: "tomato-girl/core", label: "tomato girl", type: "aesthetic",
        summary: "market-day dresses, espadrilles, sun-ripened reds — Amalfi romanticism",
        tags: ["seductive", "independent", "minimal"],
        colors: ["red", "cream", "green"], moods: ["romantic", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "eclectic grandpa", aliases: ["grandpacore", "grandpa core"],
    interpretations: [
      { id: "eclectic-grandpa/core", label: "eclectic grandpa", type: "aesthetic",
        summary: "shaggy cardigans, high-waisted trousers, swaddly topcoats, sensible shoes worn with confidence",
        tags: ["archival", "independent", "tailored"],
        colors: ["brown", "beige", "green"], moods: ["soft", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "whimsigoth", aliases: ["whimsigothic", "whimsy goth"],
    interpretations: [
      { id: "whimsigoth/core", label: "whimsigoth", type: "aesthetic",
        summary: "celestial prints, layered velvets, moon jewelry — 90s mystical maximal softness",
        tags: ["independent", "seductive", "statement", "archival"],
        colors: ["burgundy", "navy", "gold"], moods: ["moody", "romantic", "ethereal"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "coquette", aliases: ["coquettecore", "dollette"],
    interpretations: [
      { id: "coquette/core", label: "coquette", type: "aesthetic",
        summary: "bows, lace trim, blush pink, delicate layering — hyperfeminine softness with intent",
        tags: ["seductive", "independent", "statement"],
        colors: ["pink", "cream", "white"], moods: ["romantic", "soft"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "avant basic", aliases: ["avant-basic"],
    interpretations: [
      { id: "avant-basic/core", label: "avant basic", type: "aesthetic",
        summary: "pastel retro-psychedelia — checkerboard, wavy prints, curved-line maximalism",
        tags: ["statement", "independent", "avant-garde"],
        colors: ["pink", "green", "blue"], moods: ["playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "archive fashion", aliases: ["archival fashion", "grail hunting", "archive style"],
    interpretations: [
      { id: "archive-fashion/core", label: "archive fashion", type: "aesthetic",
        summary: "designer-archive collecting worn daily — runway grails, era-defining pieces, obsession as wardrobe",
        tags: ["archival", "avant-garde", "independent"],
        colors: ["black", "grey"], moods: ["severe", "nocturnal"], confidence: 0.8, provenance: P2 }] },
  { kind: "aesthetic", name: "blokecore", aliases: ["bloke core", "football shirt style"],
    interpretations: [
      { id: "blokecore/core", label: "blokecore", type: "aesthetic",
        summary: "retro football shirts, straight denim, terrace trainers — pub-to-pitch ease",
        tags: ["streetwear", "archival", "statement"],
        colors: ["red", "blue", "white"], moods: ["playful", "raw"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "blokette", aliases: ["blokette core"],
    interpretations: [
      { id: "blokette/core", label: "blokette", type: "aesthetic",
        summary: "football jerseys with mini skirts, ribbons with trainers — tomboy-feminine collision",
        tags: ["streetwear", "seductive", "statement"],
        colors: ["red", "white", "pink"], moods: ["playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "coastal cowgirl", aliases: ["beach western"],
    interpretations: [
      { id: "coastal-cowgirl/core", label: "coastal cowgirl", type: "aesthetic",
        summary: "western boots on boardwalks, denim with linen, wide-brim hats in seaside neutrals",
        tags: ["gorp", "independent", "archival"],
        colors: ["beige", "blue", "brown"], moods: ["soft", "playful"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "goblincore", aliases: ["goblin core"],
    interpretations: [
      { id: "goblincore/core", label: "goblincore", type: "aesthetic",
        summary: "textured earthy layers, mushroomy browns, found-object jewelry — slightly feral nature dressing",
        tags: ["independent", "gorp", "archival"],
        colors: ["brown", "green", "olive"], moods: ["raw", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "castlecore", aliases: ["castle core", "medievalcore"],
    interpretations: [
      { id: "castlecore/core", label: "castlecore", type: "aesthetic",
        summary: "chainmail-adjacent knits, velvet, tapestry tones — medieval romance worn modern",
        tags: ["avant-garde", "archival", "statement"],
        colors: ["grey", "burgundy", "gold"], moods: ["romantic", "severe"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "soft girl", aliases: ["soft girl 2.0", "softcore style"],
    interpretations: [
      { id: "soft-girl/core", label: "soft girl", type: "aesthetic",
        summary: "blush tones, easy knits, wearable sweetness — the daily-life edit of hyperfeminine",
        tags: ["seductive", "minimal", "independent"],
        colors: ["pink", "cream"], moods: ["soft", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "dark feminine", aliases: ["femme fatale", "dark femme"],
    interpretations: [
      { id: "dark-feminine/core", label: "dark feminine", type: "aesthetic",
        summary: "slip dresses under leather, red lips, smoke-and-silk seduction",
        tags: ["seductive", "statement", "minimal"],
        colors: ["black", "red", "burgundy"], moods: ["nocturnal", "moody"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "brat", aliases: ["brat summer", "brat green"],
    interpretations: [
      { id: "brat/core", label: "brat", type: "aesthetic",
        summary: "lime green chaos, party-worn basics, deliberate dishevelment",
        tags: ["statement", "independent", "streetwear"],
        colors: ["green", "black"], moods: ["playful", "raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "demure", aliases: ["very demure", "very mindful"],
    interpretations: [
      { id: "demure/core", label: "demure", type: "aesthetic",
        summary: "modest polish, considered accessories, quiet self-presentation",
        tags: ["minimal", "tailored"],
        colors: ["beige", "grey"], moods: ["restrained", "polished"], confidence: 0.6, provenance: P2 }] },
  { kind: "aesthetic", name: "cyber y2k", aliases: ["cybercore", "y2kcore"],
    interpretations: [
      { id: "cyber-y2k/core", label: "cyber y2k", type: "aesthetic",
        summary: "chrome, wraparound shades, tech fabrics — millennium-bug futurism revived",
        tags: ["avant-garde", "statement", "streetwear"],
        colors: ["silver", "blue", "black"], moods: ["playful", "clinical"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "e-girl", aliases: ["egirl"],
    interpretations: [
      { id: "e-girl/core", label: "e-girl", type: "aesthetic",
        summary: "layered tees, chains, pleated skirts, streaked hair — webcam-era punk-cute",
        tags: ["streetwear", "independent", "statement"],
        colors: ["black", "pink"], moods: ["playful", "moody"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "e-boy", aliases: ["eboy"],
    interpretations: [
      { id: "e-boy/core", label: "e-boy", type: "aesthetic",
        summary: "curtain hair, striped long-sleeves under tees, chains and painted nails",
        tags: ["streetwear", "independent"],
        colors: ["black", "white"], moods: ["moody", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "baddie", aliases: ["instagram baddie"],
    interpretations: [
      { id: "baddie/core", label: "baddie", type: "aesthetic",
        summary: "bodycon fits, statement nails, sneakers-to-heels confidence — feed-ready glam street",
        tags: ["seductive", "statement", "streetwear"],
        colors: ["black", "brown", "gold"], moods: ["polished", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "that girl", aliases: ["that-girl aesthetic"],
    interpretations: [
      { id: "that-girl/core", label: "that girl", type: "aesthetic",
        summary: "matching sets, journal-and-smoothie props, sunrise-routine neutrals",
        tags: ["minimal"],
        colors: ["cream", "beige", "green"], moods: ["polished", "soft"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "vsco girl", aliases: ["vsco"],
    interpretations: [
      { id: "vsco/core", label: "vsco girl", type: "aesthetic",
        summary: "oversized tees, scrunchies, shell necklaces, hydro-flask casual",
        tags: ["minimal", "streetwear"],
        colors: ["cream", "blue"], moods: ["soft", "playful"], confidence: 0.6, provenance: P2 }] },
  { kind: "aesthetic", name: "fairycore", aliases: ["fairy core", "fairy grunge"],
    interpretations: [
      { id: "fairycore/core", label: "fairycore", type: "aesthetic",
        summary: "gauzy layers, wing motifs, forest-floor pastels — ethereal nature femme",
        tags: ["independent", "seductive", "avant-garde"],
        colors: ["green", "pink", "cream"], moods: ["ethereal", "soft"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "art kid", aliases: ["art hoe", "art school"],
    interpretations: [
      { id: "art-kid/core", label: "art kid", type: "aesthetic",
        summary: "paint-splattered workwear, wire glasses, tote-bag layering — studio-to-crit dressing",
        tags: ["independent", "utilitarian", "statement"],
        colors: ["yellow", "blue", "beige"], moods: ["playful", "raw"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "model off-duty", aliases: ["off duty model", "model off duty"],
    interpretations: [
      { id: "model-off-duty/core", label: "model off-duty", type: "aesthetic",
        summary: "skinny scarf, oversized blazer, perfect denim, coffee in hand — casual that is anything but",
        tags: ["minimal", "seductive", "tailored"],
        colors: ["black", "blue", "grey"], moods: ["polished", "raw"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "airport style", aliases: ["airport fits", "travel fit"],
    interpretations: [
      { id: "airport/core", label: "airport style", type: "aesthetic",
        summary: "elevated comfort in transit — matching sets, oversized outerwear, paparazzi-ready ease",
        tags: ["minimal", "streetwear", "utilitarian"],
        colors: ["grey", "beige", "black"], moods: ["soft", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "athleisure", aliases: ["gym to street"],
    interpretations: [
      { id: "athleisure/core", label: "athleisure", type: "aesthetic",
        summary: "luxe technical sets, clean sneakers, gym-to-brunch continuity",
        tags: ["utilitarian", "minimal", "streetwear"],
        colors: ["grey", "black", "white"], moods: ["polished", "clinical"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "sneakerhead", aliases: ["sneaker culture"],
    interpretations: [
      { id: "sneakerhead/core", label: "sneakerhead", type: "aesthetic",
        summary: "the fit built from the shoes up — rotation pride, box-fresh discipline",
        tags: ["streetwear", "statement"],
        colors: ["white", "red", "black"], moods: ["playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "hypebeast", aliases: ["hype", "drop culture"],
    interpretations: [
      { id: "hypebeast/core", label: "hypebeast", type: "aesthetic",
        summary: "logo graphics, limited collabs, queue-culture uniform",
        tags: ["streetwear", "statement"],
        colors: ["red", "black", "white"], moods: ["playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "skater", aliases: ["skate style", "skatecore"],
    interpretations: [
      { id: "skater/core", label: "skater", type: "aesthetic",
        summary: "baggy pants, worn suede shoes, graphic tees — function scuffed into style",
        tags: ["streetwear", "independent", "utilitarian"],
        colors: ["blue", "brown", "white"], moods: ["raw", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "terrace casuals", aliases: ["football casuals", "casuals"],
    interpretations: [
      { id: "casuals/core", label: "terrace casuals", type: "subculture",
        summary: "track jackets, rare trainers, bucket hats — the away-day uniform lineage",
        tags: ["streetwear", "archival", "utilitarian"],
        colors: ["navy", "green", "white"], moods: ["raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "heritage workwear", aliases: ["workwear", "workwear style"],
    interpretations: [
      { id: "heritage-workwear/core", label: "heritage workwear", type: "aesthetic",
        summary: "selvedge denim, chore coats, boots that earn their creases",
        tags: ["utilitarian", "archival", "independent"],
        colors: ["brown", "navy", "olive"], moods: ["raw", "restrained"], confidence: 0.8, provenance: P2 }] },
  { kind: "aesthetic", name: "city boy", aliases: ["citiboi", "japanese city boy", "popeye style"],
    interpretations: [
      { id: "city-boy/core", label: "city boy", type: "aesthetic",
        summary: "loose chinos, layered shirting, socks-and-sandals ease — Tokyo magazine-page casual",
        tags: ["minimal", "streetwear", "independent"],
        colors: ["beige", "navy", "white"], moods: ["soft", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "amekaji", aliases: ["japanese americana", "american casual"],
    interpretations: [
      { id: "amekaji/core", label: "amekaji", type: "aesthetic",
        summary: "repro denim, military chinos, loopwheel tees — americana perfected abroad",
        tags: ["archival", "utilitarian", "independent"],
        colors: ["blue", "olive", "cream"], moods: ["raw", "restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "k-pop idol", aliases: ["kpop style", "idol style"],
    interpretations: [
      { id: "kpop/airport", label: "airport idol", type: "aesthetic",
        summary: "oversized luxury casual staged for the terminal walk",
        tags: ["streetwear", "minimal", "statement"],
        colors: ["black", "white", "beige"], moods: ["polished"], confidence: 0.7, provenance: P2 },
      { id: "kpop/stage", label: "stage idol", type: "performance",
        summary: "coordinated concept wardrobes — crystal, harness, uniform play (styling-team led, labeled as such)",
        tags: ["statement", "avant-garde", "seductive"],
        colors: ["silver", "black", "pink"], moods: ["playful", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "aesthetic", name: "normcore", aliases: ["norm core"],
    interpretations: [
      { id: "normcore/core", label: "normcore", type: "aesthetic",
        summary: "deliberate plainness — anonymous fleece, straight denim, unbranded calm",
        tags: ["minimal", "utilitarian"],
        colors: ["grey", "blue", "white"], moods: ["restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "aesthetic", name: "grunge", aliases: ["grunge style", "grunge fashion"],
    interpretations: [
      { id: "grunge/core", label: "grunge", type: "aesthetic",
        summary: "flannel layers, ruined denim, thrifted indifference — the uniform of not trying",
        tags: ["independent", "archival", "streetwear"],
        colors: ["olive", "grey", "brown"], moods: ["raw"], confidence: 0.8, provenance: P2 }] },
  { kind: "aesthetic", name: "festival", aliases: ["festival style", "festival fits"],
    interpretations: [
      { id: "festival/core", label: "festival", type: "aesthetic",
        summary: "fringe, dust-ready boots, glitter that survives the pit",
        tags: ["statement", "independent", "gorp"],
        colors: ["brown", "silver", "orange"], moods: ["playful", "raw"], confidence: 0.65, provenance: P2 }] },
  { kind: "aesthetic", name: "dad style", aliases: ["dadcore", "dad fashion"],
    interpretations: [
      { id: "dadcore/core", label: "dad style", type: "aesthetic",
        summary: "chunky white sneakers, tucked polos, practical everything — unbothered as a look",
        tags: ["minimal", "utilitarian", "archival"],
        colors: ["white", "navy", "beige"], moods: ["restrained", "playful"], confidence: 0.7, provenance: P2 }] }
];
