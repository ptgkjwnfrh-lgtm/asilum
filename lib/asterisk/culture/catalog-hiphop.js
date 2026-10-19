// lib/asterisk/culture/catalog-hiphop.js
// PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles
// every part IN ORDER and is the only module anything else imports.
//
// ORDER IS LOAD-BEARING. cultureIndex() lets a later record's name or alias
// overwrite an earlier one's, and cultureSuggestView() walks the array as it
// stands, so the sequence here is behaviour and not formatting. Add records to
// the END of the part they belong to; never reorder to tidy.
//
// HIP-HOP AND R&B ARTIST STYLE READINGS. Style readings only — never a
// personal claim about anybody.

import { P, P2, P3 } from "./provenance.js";

/** @type {import("./provenance.js").CultureRecord[]} */
export const HIPHOP = [
  // ---- HIP-HOP & R&B ARTIST STYLE READINGS ----------------------------------
  // Per the Asterisk brief: labeled style ERAS/readings — personal, performance,
  // and red-carpet/stylist-directed work are never mixed without saying so.
  // No designer credits asserted as fact; readings describe the look.
  { kind: "music", name: "asap rocky", aliases: ["a$ap rocky", "rocky", "pretty flacko"],
    interpretations: [
      { id: "rocky/archive-era", label: "archive era", type: "era",
        summary: "the early-2010s designer-street blueprint — luxury layers over Harlem streetwear instincts",
        tags: ["streetwear", "avant-garde", "archival", "statement"],
        colors: ["black", "white"], moods: ["nocturnal", "playful"], confidence: 0.75, provenance: P2 },
      { id: "rocky/dad-swag", label: "dad-swag tailoring era", type: "era",
        summary: "the 2025-26 turn — colorful ties, perfect suits, leather jackets worn like heirlooms",
        tags: ["tailored", "statement", "archival"],
        colors: ["brown", "navy", "red"], moods: ["polished", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "tyler, the creator", aliases: ["tyler the creator", "tyler okonma"],
    note: "a new character per album — readings stay separate",
    interpretations: [
      { id: "tyler/golf-prep", label: "golf prep era", type: "era",
        summary: "pastel prep — patterned sweaters, pleated chinos, vintage-luggage polish",
        tags: ["tailored", "statement", "independent", "archival"],
        colors: ["pink", "green", "cream"], moods: ["playful", "polished"], confidence: 0.8, provenance: P2 },
      { id: "tyler/red-leather", label: "90s character era", type: "era",
        summary: "red leather sets, gold chains, retro shades — a full 90s homage worn as theater",
        tags: ["statement", "archival", "streetwear"],
        colors: ["red", "gold", "black"], moods: ["playful", "aggressive"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "playboi carti", aliases: ["carti", "king vamp"],
    interpretations: [
      { id: "carti/opium", label: "vamp rockstar", type: "era",
        summary: "the opium blueprint — fitted black, flared leather, studs, silver crosses and chains, moto boots, rockstar menace",
        tags: ["avant-garde", "statement", "seductive", "independent"],
        colors: ["black", "silver"], moods: ["nocturnal", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "music", name: "ken carson", aliases: [],
    interpretations: [
      { id: "ken-carson/style", label: "Ken Carson", type: "era",
        summary: "opium second wave — moto leather, oversized graphics, chrome accents",
        tags: ["statement", "streetwear", "avant-garde"],
        colors: ["black", "silver"], moods: ["aggressive", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "destroy lonely", aliases: [],
    interpretations: [
      { id: "destroy-lonely/style", label: "Destroy Lonely", type: "era",
        summary: "opium high-fashion branch — runway layering, distressed knits, sunglasses indoors",
        tags: ["avant-garde", "statement", "independent"],
        colors: ["black", "grey"], moods: ["nocturnal", "moody"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "yeat", aliases: [],
    interpretations: [
      { id: "yeat/style", label: "Yeat", type: "era",
        summary: "rage futurism — technical layers, masked anonymity, bell-heavy accessories",
        tags: ["avant-garde", "streetwear", "statement"],
        colors: ["black", "grey"], moods: ["nocturnal", "industrial"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "kanye west", aliases: ["ye"],
    note: "eras read separately — never blended",
    interpretations: [
      { id: "ye/polo-era", label: "polo era", type: "era",
        summary: "mid-2000s prep-street — polos, backpacks, pastel collegiate confidence",
        tags: ["streetwear", "tailored", "statement"],
        colors: ["pink", "navy", "white"], moods: ["playful", "polished"], confidence: 0.8, provenance: P2 },
      { id: "ye/maximal-era", label: "leather maximal era", type: "era",
        summary: "early-2010s rockstar maximalism — leather panels, gold chains, kilt-over-leather risks",
        tags: ["statement", "avant-garde", "streetwear"],
        colors: ["black", "gold", "red"], moods: ["aggressive", "nocturnal"], confidence: 0.75, provenance: P2 },
      { id: "ye/minimal-era", label: "dystopian minimal era", type: "era",
        summary: "earth-tone knits, oversized layers, military surplus silhouettes — muted uniform dressing",
        tags: ["minimal", "utilitarian", "avant-garde"],
        colors: ["beige", "olive", "grey"], moods: ["severe", "restrained"], confidence: 0.8, provenance: P2 }] },
  { kind: "music", name: "travis scott", aliases: ["la flame", "cactus jack"],
    interpretations: [
      { id: "travis/style", label: "Travis Scott", type: "era",
        summary: "vintage tees, flame browns, workwear-skate mix with collector sneakers",
        tags: ["streetwear", "archival", "utilitarian"],
        colors: ["brown", "olive", "cream"], moods: ["raw", "nocturnal"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "young thug", aliases: ["thugger"],
    interpretations: [
      { id: "thug/style", label: "Young Thug", type: "era",
        summary: "gender-fluid statement dressing — dresses as outerwear, painted nails, silhouette risk as identity",
        tags: ["avant-garde", "statement", "seductive"],
        colors: ["black", "red", "white"], moods: ["playful", "aggressive"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "future", aliases: ["future hendrix"],
    interpretations: [
      { id: "future/style", label: "Future", type: "era",
        summary: "nocturnal designer luxury — fur, tinted shades, silk shirts after midnight",
        tags: ["statement", "seductive", "streetwear"],
        colors: ["black", "burgundy", "gold"], moods: ["nocturnal", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "drake", aliases: ["ovo", "champagne papi"],
    interpretations: [
      { id: "drake/style", label: "Drake", type: "era",
        summary: "cozy luxury casual — cashmere sweats, statement outerwear, chains over knitwear",
        tags: ["minimal", "streetwear", "statement"],
        colors: ["beige", "black", "white"], moods: ["soft", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "kendrick lamar", aliases: ["kdot", "k dot"],
    interpretations: [
      { id: "kendrick/style", label: "Kendrick Lamar", type: "era",
        summary: "quiet workwear minimalism — plain hoodies worn precisely, flared denim, chunky jewelry as the only volume",
        tags: ["minimal", "utilitarian", "independent"],
        colors: ["grey", "navy", "white"], moods: ["restrained", "raw"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "frank ocean", aliases: [],
    interpretations: [
      { id: "frank/style", label: "Frank Ocean", type: "era",
        summary: "understated collector taste — perfect basics, rare outerwear, jewelry as thesis",
        tags: ["minimal", "independent", "archival"],
        colors: ["white", "green", "black"], moods: ["soft", "restrained"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "kid cudi", aliases: ["cudi"],
    interpretations: [
      { id: "cudi/style", label: "Kid Cudi", type: "era",
        summary: "grunge-street crossover — flannels, painted denim, crop experiments done casually",
        tags: ["independent", "streetwear", "avant-garde"],
        colors: ["olive", "black", "red"], moods: ["raw", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "lil uzi vert", aliases: ["uzi"],
    interpretations: [
      { id: "uzi/style", label: "Lil Uzi Vert", type: "era",
        summary: "cyber maximalism — face gems, spiked accessories, color-blocked tech layers",
        tags: ["statement", "avant-garde", "streetwear"],
        colors: ["pink", "silver", "green"], moods: ["playful", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "snoop dogg", aliases: ["snoop"],
    interpretations: [
      { id: "snoop/style", label: "Snoop", type: "era",
        summary: "west coast ease — flannels over white tees, creased khakis, low-key chains",
        tags: ["streetwear", "archival"],
        colors: ["blue", "white", "grey"], moods: ["raw", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "tupac", aliases: ["2pac", "makaveli"],
    interpretations: [
      { id: "tupac/style", label: "Tupac", type: "era",
        summary: "90s west coast canon — bandanas, overalls with one strap, denim on denim",
        tags: ["streetwear", "archival", "statement"],
        colors: ["blue", "black", "white"], moods: ["raw", "aggressive"], confidence: 0.8, provenance: P2 }] },
  { kind: "music", name: "the notorious big", aliases: ["biggie", "biggie smalls", "notorious b.i.g."],
    interpretations: [
      { id: "biggie/style", label: "Biggie", type: "era",
        summary: "90s Brooklyn luxury — colorful patterned knits, camp collars, cane-and-crown confidence",
        tags: ["statement", "archival", "streetwear"],
        colors: ["red", "gold", "black"], moods: ["playful", "polished"], confidence: 0.8, provenance: P2 }] },
  { kind: "music", name: "jay-z", aliases: ["jay z", "hov"],
    interpretations: [
      { id: "jay/jersey-era", label: "jersey era", type: "era",
        summary: "2000s baggy uniform — throwback jerseys, du-rags, crisp white tees",
        tags: ["streetwear", "archival"],
        colors: ["blue", "white", "red"], moods: ["raw", "playful"], confidence: 0.8, provenance: P2 },
      { id: "jay/tailored-era", label: "grown tailoring era", type: "era",
        summary: "boardroom luxury — soft-shoulder suits, fine knits, watch-collector restraint",
        tags: ["tailored", "minimal", "statement"],
        colors: ["navy", "grey", "cream"], moods: ["polished", "restrained"], confidence: 0.8, provenance: P2 }] },
  { kind: "music", name: "nas", aliases: [],
    interpretations: [
      { id: "nas/style", label: "Nas", type: "era",
        summary: "Queensbridge classic — leather jackets, wheat boots, chains worn matter-of-fact",
        tags: ["streetwear", "archival", "utilitarian"],
        colors: ["brown", "black", "beige"], moods: ["raw", "restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "wu-tang clan", aliases: ["wu-tang", "wu tang"],
    interpretations: [
      { id: "wu-tang/style", label: "Wu-Tang", type: "era",
        summary: "90s Staten uniform — hoodies, army jackets, wheat timbs",
        tags: ["streetwear", "utilitarian", "archival"],
        colors: ["black", "olive", "beige"], moods: ["raw", "aggressive"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "mf doom", aliases: ["doom", "metal face"],
    interpretations: [
      { id: "doom/style", label: "DOOM", type: "era",
        summary: "villain utilitarian — workwear anonymity, the mask as the whole statement",
        tags: ["utilitarian", "independent", "streetwear"],
        colors: ["grey", "olive", "black"], moods: ["raw", "restrained"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "missy elliott", aliases: ["missy"],
    interpretations: [
      { id: "missy/style", label: "Missy", type: "performance",
        summary: "futurist sportswear volume — inflated silhouettes, patent shine, video-set armor (performance wardrobe, labeled as such)",
        tags: ["avant-garde", "statement", "streetwear"],
        colors: ["black", "silver", "red"], moods: ["playful", "aggressive"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "lil kim", aliases: [],
    interpretations: [
      { id: "lil-kim/style", label: "Lil Kim", type: "era",
        summary: "90s glam maximal — fur, monogram prints, wigs as accessories, fearless color",
        tags: ["statement", "seductive", "archival"],
        colors: ["pink", "gold", "burgundy"], moods: ["playful", "nocturnal"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "rihanna", aliases: ["riri"],
    note: "street style vs styled red carpet — kept separate per the brief",
    interpretations: [
      { id: "rihanna/street", label: "off-duty", type: "personal",
        summary: "oversized outerwear over bare legs, beanies with heels — risk worn casually",
        tags: ["streetwear", "seductive", "statement", "avant-garde"],
        colors: ["black", "green", "blue"], moods: ["nocturnal", "playful"], confidence: 0.75, provenance: P2 },
      { id: "rihanna/red-carpet", label: "red carpet", type: "red-carpet",
        summary: "event armor — sculptural gowns and theme-defining entrances (stylist-collaborative, labeled as such)",
        tags: ["statement", "avant-garde", "seductive"],
        colors: ["gold", "red", "white"], moods: ["polished", "romantic"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "beyonce", aliases: ["beyoncé", "queen b"],
    interpretations: [
      { id: "beyonce/stage", label: "stage", type: "performance",
        summary: "crystal bodysuits, custom armor, spotlight engineering (performance wardrobe, team-built)",
        tags: ["statement", "seductive"],
        colors: ["gold", "silver", "black"], moods: ["polished", "aggressive"], confidence: 0.75, provenance: P2 },
      { id: "beyonce/off-duty", label: "off-duty", type: "personal",
        summary: "denim-forward luxe casual, western touches in the renaissance years",
        tags: ["streetwear", "statement", "tailored"],
        colors: ["blue", "cream", "gold"], moods: ["polished", "playful"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "nicki minaj", aliases: ["nicki"],
    interpretations: [
      { id: "nicki/style", label: "Nicki", type: "era",
        summary: "color maximalism — pink everything, curve-first silhouettes, wig-as-palette",
        tags: ["statement", "seductive"],
        colors: ["pink", "green", "blue"], moods: ["playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "cardi b", aliases: ["cardi"],
    interpretations: [
      { id: "cardi/red-carpet", label: "archive couture carpet", type: "red-carpet",
        summary: "vintage-runway showpieces worn at full volume (stylist-collaborative, labeled as such)",
        tags: ["statement", "avant-garde", "archival", "seductive"],
        colors: ["red", "gold", "black"], moods: ["polished", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "megan thee stallion", aliases: ["megan"],
    interpretations: [
      { id: "megan/style", label: "Megan", type: "era",
        summary: "body-confident glam sport — cutouts, athletic references, high-shine finishes",
        tags: ["seductive", "statement", "streetwear"],
        colors: ["orange", "black", "blue"], moods: ["playful", "aggressive"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "doja cat", aliases: ["doja"],
    interpretations: [
      { id: "doja/editorial", label: "editorial experiments", type: "red-carpet",
        summary: "shape-shifting art looks — sculptural risk (heavily editorial/stylist-led, labeled as such)",
        tags: ["avant-garde", "statement", "seductive"],
        colors: ["red", "silver", "black"], moods: ["playful", "ethereal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "sza", aliases: [],
    interpretations: [
      { id: "sza/style", label: "SZA", type: "era",
        summary: "earthy 90s r&b revival — crochet, low-rise denim, jersey layers gone soft",
        tags: ["independent", "seductive", "streetwear", "gorp"],
        colors: ["brown", "green", "cream"], moods: ["soft", "romantic"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "solange", aliases: [],
    interpretations: [
      { id: "solange/style", label: "Solange", type: "era",
        summary: "art-world sculpture dressing — monochrome volumes, gallery-grade minimal statement",
        tags: ["avant-garde", "minimal", "statement", "independent"],
        colors: ["cream", "brown", "red"], moods: ["ethereal", "polished"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "erykah badu", aliases: ["badu"],
    interpretations: [
      { id: "badu/style", label: "Badu", type: "era",
        summary: "spiritual eclectic layering — towering hats, vintage textiles, jewelry with history",
        tags: ["independent", "avant-garde", "archival", "statement"],
        colors: ["brown", "green", "gold"], moods: ["ethereal", "romantic"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "lauryn hill", aliases: [],
    interpretations: [
      { id: "lauryn/style", label: "Lauryn Hill", type: "era",
        summary: "90s conscious style — denim workwear, knit vests, headwraps worn regal",
        tags: ["independent", "archival", "streetwear"],
        colors: ["brown", "olive", "cream"], moods: ["soft", "restrained"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "fka twigs", aliases: ["twigs"],
    interpretations: [
      { id: "twigs/style", label: "FKA twigs", type: "era",
        summary: "movement-first avant wear — corsetry, bias drape, martial-arts references",
        tags: ["avant-garde", "seductive", "independent"],
        colors: ["cream", "black", "red"], moods: ["ethereal", "aggressive"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "rosalia", aliases: ["rosalía"],
    interpretations: [
      { id: "rosalia/motomami", label: "motomami era", type: "era",
        summary: "moto-y2k glam — biker leather with pearl details, chrome nails, flamenco echoes",
        tags: ["statement", "seductive", "streetwear", "avant-garde"],
        colors: ["black", "silver", "red"], moods: ["aggressive", "playful"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "bad bunny", aliases: ["benito"],
    interpretations: [
      { id: "bad-bunny/style", label: "Bad Bunny", type: "era",
        summary: "gender-fluid Caribbean street — painted nails, skirts over shorts, sunglasses maximal",
        tags: ["statement", "streetwear", "avant-garde", "seductive"],
        colors: ["white", "pink", "blue"], moods: ["playful", "nocturnal"], confidence: 0.75, provenance: P2 }] },
  { kind: "music", name: "skepta", aliases: [],
    interpretations: [
      { id: "skepta/style", label: "Skepta", type: "era",
        summary: "grime uniform elevated — sharp tracksuits, later tailoring with the same edge",
        tags: ["streetwear", "utilitarian", "tailored"],
        colors: ["black", "grey", "olive"], moods: ["severe", "raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "central cee", aliases: ["cench"],
    interpretations: [
      { id: "central-cee/style", label: "Central Cee", type: "era",
        summary: "UK drill uniform gone luxury — puffers, trackies, crossbody, designer touches kept casual",
        tags: ["streetwear", "utilitarian", "statement"],
        colors: ["black", "grey", "white"], moods: ["raw", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "stormzy", aliases: [],
    interpretations: [
      { id: "stormzy/style", label: "Stormzy", type: "era",
        summary: "sharp UK street with occasion tailoring — clean lines at scale",
        tags: ["streetwear", "tailored", "statement"],
        colors: ["black", "red", "white"], moods: ["polished", "aggressive"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "little simz", aliases: [],
    interpretations: [
      { id: "simz/style", label: "Little Simz", type: "era",
        summary: "tomboy tailoring — boxy suits, knit vests, considered restraint",
        tags: ["tailored", "minimal", "independent"],
        colors: ["brown", "cream", "navy"], moods: ["restrained", "polished"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "pop smoke", aliases: [],
    interpretations: [
      { id: "pop-smoke/style", label: "Pop Smoke", type: "era",
        summary: "Brooklyn drill elegance — designer street worn sharp, a canon cut short",
        tags: ["streetwear", "statement", "tailored"],
        colors: ["black", "white", "red"], moods: ["nocturnal", "aggressive"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "lil peep", aliases: ["peep"],
    interpretations: [
      { id: "peep/style", label: "Lil Peep", type: "era",
        summary: "emo-rap thrift punk — choppy layers, band tees, chains",
        tags: ["independent", "streetwear", "statement"],
        colors: ["pink", "black"], moods: ["moody", "raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "yung lean", aliases: ["sadboys", "sad boys"],
    interpretations: [
      { id: "yung-lean/style", label: "sadboys era", type: "era",
        summary: "internet-melancholy streetwear — bucket hats, iced-tea palette, oversized sports layers",
        tags: ["streetwear", "independent", "minimal"],
        colors: ["blue", "white", "green"], moods: ["moody", "soft"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "bladee", aliases: ["drain gang", "draincore", "drainer"],
    interpretations: [
      { id: "bladee/style", label: "draincore", type: "era",
        summary: "angelic grunge — distressed layers, silver everything, washed-out ethereal street",
        tags: ["avant-garde", "independent", "streetwear"],
        colors: ["silver", "white", "grey"], moods: ["ethereal", "moody"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "chief keef", aliases: ["sosa"],
    interpretations: [
      { id: "keef/style", label: "Chief Keef", type: "era",
        summary: "2012 drill origin uniform — designer belts, graphic tees, dreads and diamonds",
        tags: ["streetwear", "statement"],
        colors: ["black", "red", "white"], moods: ["raw", "aggressive"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "westside gunn", aliases: ["griselda"],
    interpretations: [
      { id: "westside-gunn/style", label: "Westside Gunn", type: "era",
        summary: "vintage-designer maximalism — wrestling tees under fur, luxury layered like a flex archive",
        tags: ["archival", "statement", "streetwear"],
        colors: ["brown", "gold", "red"], moods: ["playful", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "gunna", aliases: ["wunna"],
    interpretations: [
      { id: "gunna/style", label: "Gunna", type: "era",
        summary: "fashion-plate luxury street — quilted leather, monochrome designer fits worn with intent",
        tags: ["statement", "streetwear", "seductive"],
        colors: ["green", "brown", "black"], moods: ["polished", "nocturnal"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "offset", aliases: [],
    interpretations: [
      { id: "offset/style", label: "Offset", type: "era",
        summary: "designer tailoring maximal — printed suits, pearl details, front-row polish",
        tags: ["tailored", "statement", "seductive"],
        colors: ["red", "black", "cream"], moods: ["polished", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "21 savage", aliases: [],
    interpretations: [
      { id: "21-savage/style", label: "21 Savage", type: "era",
        summary: "quiet designer casual — muted luxury basics, a dagger of jewelry",
        tags: ["minimal", "streetwear"],
        colors: ["black", "grey", "navy"], moods: ["restrained", "nocturnal"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "lil yachty", aliases: ["yachty"],
    interpretations: [
      { id: "yachty/style", label: "Lil Yachty", type: "era",
        summary: "art-kid eclectic — beaded braids to painted nails, thrifted volume with designer punctuation",
        tags: ["independent", "avant-garde", "streetwear", "statement"],
        colors: ["red", "cream", "blue"], moods: ["playful", "raw"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "rico nasty", aliases: [],
    interpretations: [
      { id: "rico-nasty/style", label: "Rico Nasty", type: "era",
        summary: "punk-rap maximal — spikes, tartan, neon aggression worn joyful",
        tags: ["statement", "independent", "avant-garde"],
        colors: ["red", "green", "black"], moods: ["aggressive", "playful"], confidence: 0.7, provenance: P2 }] },
  { kind: "music", name: "machine gun kelly", aliases: ["mgk"],
    interpretations: [
      { id: "mgk/style", label: "MGK", type: "era",
        summary: "pop-punk revival — baby pink suits, barbed-wire graphics, painted nails",
        tags: ["statement", "independent", "seductive"],
        colors: ["pink", "black", "silver"], moods: ["playful", "aggressive"], confidence: 0.65, provenance: P2 }] },
  { kind: "music", name: "post malone", aliases: ["posty"],
    interpretations: [
      { id: "post-malone/style", label: "Post Malone", type: "era",
        summary: "tattooed western casual — fringe, pearl snaps, beat-up boots and big buckles",
        tags: ["independent", "archival", "statement"],
        colors: ["brown", "cream", "red"], moods: ["raw", "playful"], confidence: 0.7, provenance: P2 }] }
];
