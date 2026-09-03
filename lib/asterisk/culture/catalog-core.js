// lib/asterisk/culture/catalog-core.js
// PART OF THE CULTURE CATALOG — see lib/asterisk/culture.js, which assembles
// every part IN ORDER and is the only module anything else imports.
//
// ORDER IS LOAD-BEARING. cultureIndex() lets a later record's name or alias
// overwrite an earlier one's, and cultureSuggestView() walks the array as it
// stands, so the sequence here is behaviour and not formatting. Add records to
// the END of the part they belong to; never reorder to tidy.
//
// THE ORIGINAL v1 SET: films, music, cities and decades — the records the
// catalog opened with.

import { P, P2, P3 } from "./provenance.js";

/** @type {import("./provenance.js").CultureRecord[]} */
export const CORE = [
  // ---- FILMS ---------------------------------------------------------------
  {
    kind: "film", name: "fight club", aliases: ["fightclub"],
    note: "one film, four wardrobes — never blended",
    interpretations: [
      { id: "fight-club/tyler", label: "Tyler Durden", type: "character",
        summary: "red leather, printed shirts, tinted lenses, 70s flare — sleazy anti-corporate glamour",
        tags: ["statement", "seductive", "archival", "independent"],
        colors: ["red", "brown", "burgundy"], moods: ["aggressive", "nocturnal"], confidence: 0.8, provenance: P },
      { id: "fight-club/narrator", label: "The Narrator", type: "character",
        summary: "depersonalized office wear — muted shirts, conservative ties, restrained neutrals",
        tags: ["tailored", "minimal"],
        colors: ["grey", "beige", "white"], moods: ["clinical", "restrained"], confidence: 0.8, provenance: P },
      { id: "fight-club/marla", label: "Marla Singer", type: "character",
        summary: "dark vintage, fur textures, slip shapes — smudged, decayed glamour",
        tags: ["seductive", "archival", "independent", "avant-garde"],
        colors: ["black", "burgundy"], moods: ["moody", "romantic"], confidence: 0.8, provenance: P },
      { id: "fight-club/atmosphere", label: "the atmosphere", type: "atmosphere",
        summary: "industrial decay, distressed textures, dirty neutrals, blood-red accents, late-90s grunge",
        tags: ["independent", "utilitarian", "archival", "streetwear"],
        colors: ["brown", "grey", "red"], moods: ["raw", "industrial"], confidence: 0.75, provenance: P },
    ],
  },
  {
    kind: "film", name: "blade runner", aliases: ["bladerunner", "blade runner 2049"],
    interpretations: [
      { id: "blade-runner/atmosphere", label: "neon noir", type: "atmosphere",
        summary: "rain-slick trenches, high collars, technical layers under neon — retro-future noir",
        tags: ["avant-garde", "utilitarian", "statement", "tailored"],
        colors: ["black", "grey", "neon"], moods: ["nocturnal", "industrial"], confidence: 0.75, provenance: P },
    ],
  },
  {
    kind: "film", name: "american psycho", aliases: [],
    interpretations: [
      { id: "american-psycho/bateman", label: "Patrick Bateman", type: "character",
        summary: "immaculate 80s power tailoring — strong shoulders, pinstripes, obsessive polish",
        tags: ["tailored", "statement", "minimal"],
        colors: ["grey", "navy", "white"], moods: ["polished", "severe"], confidence: 0.8, provenance: P },
    ],
  },
  {
    kind: "film", name: "in the mood for love", aliases: [],
    interpretations: [
      { id: "in-the-mood-for-love/atmosphere", label: "the atmosphere", type: "atmosphere",
        summary: "restrained romance — high collars, waist-defined silhouettes, saturated florals in low light",
        tags: ["seductive", "tailored", "archival"],
        colors: ["burgundy", "green", "gold"], moods: ["romantic", "nocturnal"], confidence: 0.75, provenance: P },
    ],
  },

  // ---- MUSIC ---------------------------------------------------------------
  {
    kind: "music", name: "deftones", aliases: ["passenger deftones", "white pony"],
    interpretations: [
      { id: "deftones/mood", label: "the Deftones mood", type: "sound",
        summary: "tense, sensual, cinematic heaviness — glossy black, metallic, body-conscious layers",
        tags: ["seductive", "avant-garde", "statement", "independent"],
        colors: ["black", "silver", "burgundy"], moods: ["moody", "nocturnal"], confidence: 0.75, provenance: P },
    ],
  },
  {
    kind: "music", name: "drill", aliases: ["uk drill"],
    interpretations: [
      { id: "drill/scene", label: "drill", type: "scene",
        summary: "technical shells, balaclavas-adjacent knits, sharp sportswear — functional street uniform",
        tags: ["streetwear", "utilitarian", "statement"],
        colors: ["black", "grey"], moods: ["severe"], confidence: 0.7, provenance: P },
    ],
  },
  {
    kind: "music", name: "ambient", aliases: ["ambient techno"],
    interpretations: [
      { id: "ambient/scene", label: "ambient", type: "sound",
        summary: "weightless neutrals, soft volumes, quiet technical fabrics",
        tags: ["minimal", "avant-garde"],
        colors: ["cream", "grey", "white"], moods: ["soft", "ethereal"], confidence: 0.7, provenance: P },
    ],
  },

  // ---- CITIES (living style clusters, not stereotypes; change over time) ----
  {
    kind: "city", name: "berlin", aliases: [],
    note: "city style shifts constantly — clusters, not costume",
    interpretations: [
      { id: "berlin/club", label: "club uniform", type: "subculture",
        summary: "all-black technical utility — shells, straps, industrial hardware",
        tags: ["utilitarian", "avant-garde", "minimal"],
        colors: ["black"], moods: ["industrial", "nocturnal"], confidence: 0.7, provenance: P },
      { id: "berlin/street", label: "street", type: "subculture",
        summary: "secondhand layers, workwear, anti-precious mixing",
        tags: ["independent", "streetwear", "archival"],
        colors: ["olive", "grey"], moods: ["raw"], confidence: 0.7, provenance: P },
    ],
  },
  {
    kind: "city", name: "paris", aliases: ["parisian"],
    interpretations: [
      { id: "paris/tailored", label: "old-money tailoring", type: "subculture",
        summary: "unforced tailoring, trench coats, quiet luxury restraint",
        tags: ["tailored", "minimal", "archival"],
        colors: ["beige", "navy", "cream"], moods: ["polished"], confidence: 0.7, provenance: P },
      { id: "paris/youth", label: "youth style", type: "subculture",
        summary: "moto jackets over vintage denim, scuffed leather, cigarette silhouettes",
        tags: ["independent", "streetwear", "seductive"],
        colors: ["black", "blue"], moods: ["raw", "romantic"], confidence: 0.65, provenance: P },
    ],
  },
  {
    kind: "city", name: "tokyo", aliases: [],
    interpretations: [
      { id: "tokyo/avant", label: "avant tailoring", type: "subculture",
        summary: "sculptural black, deconstruction, volume play",
        tags: ["avant-garde", "independent", "archival"],
        colors: ["black"], moods: ["severe", "ethereal"], confidence: 0.7, provenance: P },
      { id: "tokyo/street", label: "street layering", type: "subculture",
        summary: "precise streetwear, technical layers, collector energy",
        tags: ["streetwear", "utilitarian", "statement"],
        colors: ["navy", "olive"], moods: ["playful"], confidence: 0.7, provenance: P },
    ],
  },
  {
    kind: "city", name: "washington dc", aliases: ["dc", "d.c.", "the dmv"],
    note: "per the Asterisk brief — clusters, sourced from living scenes",
    interpretations: [
      { id: "dc/government", label: "government tailoring", type: "subculture",
        summary: "navy suiting, security-badge minimalism, weatherproof outer layers",
        tags: ["tailored", "minimal"],
        colors: ["navy", "grey"], moods: ["polished", "restrained"], confidence: 0.65, provenance: P },
      { id: "dc/hbcu", label: "HBCU style", type: "subculture",
        summary: "sharp collegiate dressing, statement color, tailored-street mixing",
        tags: ["statement", "tailored", "streetwear"],
        colors: ["red", "gold"], moods: ["playful", "polished"], confidence: 0.65, provenance: P },
      { id: "dc/dmv-street", label: "DMV streetwear", type: "subculture",
        summary: "regional street uniform — technical outerwear, clean sneakers, go-go lineage",
        tags: ["streetwear", "utilitarian", "independent"],
        colors: ["black", "white"], moods: ["raw"], confidence: 0.65, provenance: P },
    ],
  },

  // ---- DECADES (scenes within a decade, never one costume) ------------------
  {
    kind: "decade", name: "70s", aliases: ["1970s", "seventies"],
    interpretations: [
      { id: "70s/disco", label: "disco", type: "scene",
        summary: "liquid shirts, flared trousers, metallic shine after midnight",
        tags: ["seductive", "statement", "archival"],
        colors: ["gold", "brown", "silver"], moods: ["playful", "nocturnal"], confidence: 0.75, provenance: P },
      { id: "70s/punk", label: "punk", type: "scene",
        summary: "torn knits, safety-pin hardware, deliberate ruin",
        tags: ["independent", "statement", "avant-garde"],
        colors: ["black", "red"], moods: ["aggressive", "raw"], confidence: 0.75, provenance: P },
      { id: "70s/bohemian", label: "bohemian", type: "scene",
        summary: "earth tones, suede, loose layers, handcraft",
        tags: ["independent", "archival", "gorp"],
        colors: ["brown", "cream", "olive"], moods: ["soft", "romantic"], confidence: 0.7, provenance: P },
      { id: "70s/tailoring", label: "corporate tailoring", type: "scene",
        summary: "wide lapels, earth-tone suiting, structured confidence",
        tags: ["tailored", "archival", "statement"],
        colors: ["brown", "beige"], moods: ["polished"], confidence: 0.7, provenance: P },
    ],
  },
  {
    kind: "decade", name: "90s", aliases: ["1990s", "nineties"],
    interpretations: [
      { id: "90s/grunge", label: "grunge", type: "scene",
        summary: "flannel layers, ruined denim, thrifted indifference",
        tags: ["independent", "streetwear", "archival"],
        colors: ["olive", "grey", "brown"], moods: ["raw"], confidence: 0.75, provenance: P },
      { id: "90s/minimalism", label: "minimalism", type: "scene",
        summary: "clean column silhouettes, slip dresses, no ornament",
        tags: ["minimal", "tailored", "seductive"],
        colors: ["black", "white", "grey"], moods: ["clinical", "soft"], confidence: 0.75, provenance: P },
      { id: "90s/hip-hop", label: "hip-hop", type: "scene",
        summary: "oversized everything, sports logos, statement outerwear",
        tags: ["streetwear", "statement", "utilitarian"],
        colors: ["navy", "red", "white"], moods: ["playful"], confidence: 0.75, provenance: P },
    ],
  },
  {
    kind: "decade", name: "y2k", aliases: ["2000s", "millennium"],
    interpretations: [
      { id: "y2k/scene", label: "y2k", type: "scene",
        summary: "low rises, shine, tech optimism, tiny bags",
        tags: ["statement", "streetwear", "seductive"],
        colors: ["silver", "pink", "blue"], moods: ["playful"], confidence: 0.7, provenance: P },
    ],
  }
];
