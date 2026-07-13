// lib/asterisk/culture.js
// Asterisk AI — curated cultural knowledge v1 (films, music, cities, decades).
// These are EDITORIAL STYLE READINGS, not factual claims: no designer credits,
// no season attributions, no costume-designer facts are asserted — only how a
// reference translates into wearable fashion signals. Every interpretation is
// human-reviewed (checked in through PR review), carries provenance
// "curated-editorial-v1", and maps to the LIVE brain tag space so results are
// real products, never costume replicas. Entities with multiple readings stay
// SEPARATE (Tyler ≠ the Narrator; disco ≠ punk) — never blended.
//
// Extend by adding records here (small, reviewable diffs). A future research
// pipeline feeds learned_facts, never this file directly.

// Brain tag space (lowercase; resolveTag canonicalizes): avant-garde,
// seductive, statement, tailored, archival, minimal, utilitarian, streetwear,
// independent, gorp.

const P = "curated-editorial-v1";

export const CULTURE = [
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
  },

  // ==== EXPANSION (Day 12 pt2): films/tv, music, cities, decades, ==========
  // ==== subcultures, abstract concepts, art movements =======================

  // ---- FILMS & TV ------------------------------------------------------------
  { kind: "film", name: "the matrix", aliases: ["matrix"],
    interpretations: [
      { id: "matrix/uniform", label: "the uniform", type: "atmosphere",
        summary: "floor-length black coats, tiny sunglasses, patent shine — cyber austerity",
        tags: ["avant-garde", "statement", "minimal", "utilitarian"],
        colors: ["black"], moods: ["severe", "nocturnal"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "drive", aliases: [],
    interpretations: [
      { id: "drive/driver", label: "the Driver", type: "character",
        summary: "satin bomber, leather gloves, clean denim — quiet menace under neon",
        tags: ["minimal", "statement", "seductive"],
        colors: ["silver", "white", "black"], moods: ["nocturnal", "restrained"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "heat", aliases: [],
    interpretations: [
      { id: "heat/crew", label: "the crew", type: "atmosphere",
        summary: "grey-scale 90s tailoring, boxy suits, functional precision",
        tags: ["tailored", "minimal", "utilitarian"],
        colors: ["grey", "navy", "black"], moods: ["clinical", "severe"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "a clockwork orange", aliases: ["clockwork orange"],
    interpretations: [
      { id: "clockwork/droog", label: "droog uniform", type: "atmosphere",
        summary: "all-white with bowler-hat menace, braces, industrial boots — uniform as threat",
        tags: ["avant-garde", "statement", "utilitarian"],
        colors: ["white", "black"], moods: ["aggressive", "clinical"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "the royal tenenbaums", aliases: ["royal tenenbaums", "wes anderson"],
    interpretations: [
      { id: "tenenbaums/family", label: "the family", type: "atmosphere",
        summary: "track suits with fur coats, headbands, faded prep — nostalgia worn literally",
        tags: ["archival", "independent", "statement", "tailored"],
        colors: ["red", "beige", "brown"], moods: ["playful", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "kill bill", aliases: [],
    interpretations: [
      { id: "kill-bill/bride", label: "the Bride", type: "character",
        summary: "sport stripes as armor, moto jackets, blade-clean lines",
        tags: ["streetwear", "statement", "utilitarian"],
        colors: ["gold", "black"], moods: ["aggressive"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "trainspotting", aliases: [],
    interpretations: [
      { id: "trainspotting/crew", label: "the crew", type: "atmosphere",
        summary: "shrunken tees, drainpipe denim, scuffed trainers — 90s British decay",
        tags: ["independent", "streetwear", "archival"],
        colors: ["grey", "olive"], moods: ["raw"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "lost in translation", aliases: [],
    interpretations: [
      { id: "lost-in-translation/mood", label: "the mood", type: "atmosphere",
        summary: "soft knits, unstructured layers, hotel-window pastels — jet-lag intimacy",
        tags: ["minimal", "seductive"],
        colors: ["pink", "grey", "cream"], moods: ["soft", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "ghost in the shell", aliases: [],
    interpretations: [
      { id: "gits/section9", label: "Section 9", type: "atmosphere",
        summary: "techwear bodysuits, tactical layers, cybernetic minimalism",
        tags: ["utilitarian", "avant-garde", "minimal"],
        colors: ["black", "grey", "neon"], moods: ["industrial", "clinical"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "akira", aliases: [],
    interpretations: [
      { id: "akira/kaneda", label: "Kaneda", type: "character",
        summary: "the red moto jacket, biker boots, neon-city speed",
        tags: ["streetwear", "statement", "utilitarian"],
        colors: ["red", "black"], moods: ["aggressive", "nocturnal"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "paris texas", aliases: ["paris, texas"],
    interpretations: [
      { id: "paris-texas/mood", label: "the mood", type: "atmosphere",
        summary: "sun-bleached western wear, dusty suiting, lonely americana",
        tags: ["archival", "independent", "utilitarian"],
        colors: ["red", "brown", "beige"], moods: ["raw", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "the talented mr ripley", aliases: ["talented mr ripley", "ripley"],
    interpretations: [
      { id: "ripley/riviera", label: "riviera wardrobe", type: "atmosphere",
        summary: "50s resort tailoring, knit polos, borrowed old money",
        tags: ["tailored", "archival", "minimal"],
        colors: ["cream", "navy", "white"], moods: ["polished", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "film", name: "american gigolo", aliases: [],
    interpretations: [
      { id: "gigolo/julian", label: "Julian", type: "character",
        summary: "fluid 80s tailoring, unstructured jackets, silk ease",
        tags: ["tailored", "seductive", "minimal"],
        colors: ["grey", "beige", "blue"], moods: ["polished", "soft"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "dune", aliases: [],
    interpretations: [
      { id: "dune/arrakis", label: "Arrakis", type: "atmosphere",
        summary: "desert drape, technical stillsuit utility, monastic layers",
        tags: ["avant-garde", "utilitarian", "gorp", "minimal"],
        colors: ["beige", "brown", "grey"], moods: ["severe", "ethereal"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "the crow", aliases: ["crow"],
    interpretations: [
      { id: "crow/eric", label: "Eric Draven", type: "character",
        summary: "torn black layers, leather, rain-soaked goth romance",
        tags: ["independent", "seductive", "statement", "avant-garde"],
        colors: ["black"], moods: ["moody", "nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "la haine", aliases: [],
    interpretations: [
      { id: "la-haine/banlieue", label: "banlieue uniform", type: "atmosphere",
        summary: "90s sportswear, bombers, monochrome documentary grit",
        tags: ["streetwear", "utilitarian", "archival"],
        colors: ["black", "white", "grey"], moods: ["raw"], confidence: 0.7, provenance: P }] },
  { kind: "film", name: "chungking express", aliases: ["fallen angels"],
    interpretations: [
      { id: "chungking/mood", label: "the mood", type: "atmosphere",
        summary: "neon-blurred trench coats, blonde wigs, midnight snack-bar romance",
        tags: ["independent", "seductive", "streetwear"],
        colors: ["neon", "black", "blue"], moods: ["nocturnal", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "tv", name: "the sopranos", aliases: ["sopranos"],
    interpretations: [
      { id: "sopranos/leisure", label: "Jersey leisure", type: "atmosphere",
        summary: "silk camp collars, velour tracksuits, pinky-ring tailoring",
        tags: ["statement", "seductive", "tailored"],
        colors: ["burgundy", "brown", "gold"], moods: ["playful", "polished"], confidence: 0.75, provenance: P }] },
  { kind: "tv", name: "succession", aliases: [],
    interpretations: [
      { id: "succession/quiet", label: "quiet luxury", type: "atmosphere",
        summary: "logo-less cashmere, oceanic navys, money that whispers",
        tags: ["minimal", "tailored"],
        colors: ["navy", "grey", "beige"], moods: ["restrained", "polished"], confidence: 0.8, provenance: P }] },
  { kind: "tv", name: "twin peaks", aliases: [],
    interpretations: [
      { id: "twin-peaks/lodge", label: "the town", type: "atmosphere",
        summary: "50s-by-way-of-90s — plaid, saddle shoes, diner-booth mystery",
        tags: ["archival", "independent", "seductive"],
        colors: ["red", "brown", "green"], moods: ["moody", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "tv", name: "euphoria", aliases: [],
    interpretations: [
      { id: "euphoria/party", label: "the party", type: "atmosphere",
        summary: "glitter under eyes, mesh layers, y2k revival maximalism",
        tags: ["statement", "seductive", "streetwear"],
        colors: ["pink", "silver", "blue"], moods: ["playful", "nocturnal"], confidence: 0.7, provenance: P }] },

  // ---- MUSIC: genres ---------------------------------------------------------
  { kind: "music", name: "post-punk", aliases: ["post punk"],
    interpretations: [
      { id: "post-punk/scene", label: "post-punk", type: "sound",
        summary: "narrow black tailoring, worn knits, austere romance",
        tags: ["independent", "minimal", "avant-garde", "archival"],
        colors: ["black", "grey"], moods: ["moody", "severe"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "goth", aliases: ["gothic"],
    interpretations: [
      { id: "goth/scene", label: "goth", type: "scene",
        summary: "velvet, lace, silver hardware — ornate darkness worn daily",
        tags: ["seductive", "statement", "independent", "avant-garde"],
        colors: ["black", "burgundy", "silver"], moods: ["moody", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "shoegaze", aliases: [],
    interpretations: [
      { id: "shoegaze/scene", label: "shoegaze", type: "sound",
        summary: "oversized knits, washed-out layers, hair in the eyes",
        tags: ["independent", "minimal", "archival"],
        colors: ["grey", "blue", "cream"], moods: ["soft", "ethereal"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "techno", aliases: [],
    interpretations: [
      { id: "techno/scene", label: "techno", type: "scene",
        summary: "functional black, reflective details, clothes built for 6am",
        tags: ["utilitarian", "minimal", "avant-garde"],
        colors: ["black"], moods: ["industrial", "nocturnal"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "house", aliases: ["house music"],
    interpretations: [
      { id: "house/scene", label: "house", type: "scene",
        summary: "joyful color, loose silk, sweat-friendly shine — dancefloor generosity",
        tags: ["statement", "streetwear", "seductive"],
        colors: ["gold", "red", "blue"], moods: ["playful"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "hip-hop", aliases: ["hip hop", "rap"],
    interpretations: [
      { id: "hip-hop/classic", label: "golden era", type: "scene",
        summary: "oversized proportions, statement outerwear, chains and clean sneakers",
        tags: ["streetwear", "statement", "archival"],
        colors: ["navy", "red", "gold"], moods: ["playful", "aggressive"], confidence: 0.75, provenance: P },
      { id: "hip-hop/now", label: "now", type: "scene",
        summary: "designer-street hybrid, layered technical pieces, jewelry maximalism",
        tags: ["streetwear", "statement", "avant-garde"],
        colors: ["black", "white"], moods: ["nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "metal", aliases: ["heavy metal"],
    interpretations: [
      { id: "metal/scene", label: "metal", type: "scene",
        summary: "band tees, battle denim, leather and studs — devotion as uniform",
        tags: ["independent", "statement", "archival"],
        colors: ["black"], moods: ["aggressive", "raw"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "emo", aliases: [],
    interpretations: [
      { id: "emo/scene", label: "emo", type: "scene",
        summary: "skinny silhouettes, studded belts, fringe over one eye",
        tags: ["independent", "streetwear", "statement"],
        colors: ["black", "red"], moods: ["moody"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "indie sleaze", aliases: ["indie"],
    interpretations: [
      { id: "indie-sleaze/scene", label: "indie sleaze", type: "scene",
        summary: "flash-photo disarray, skinny jeans, thrifted fur, smudged glamour",
        tags: ["independent", "seductive", "archival", "statement"],
        colors: ["black", "silver"], moods: ["nocturnal", "raw"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "city pop", aliases: ["citypop"],
    interpretations: [
      { id: "city-pop/scene", label: "city pop", type: "sound",
        summary: "80s Tokyo gloss — pastel blazers, high-shine leisure, seaside optimism",
        tags: ["tailored", "statement", "archival"],
        colors: ["pink", "blue", "white"], moods: ["playful", "polished"], confidence: 0.65, provenance: P }] },
  { kind: "music", name: "r&b", aliases: ["rnb", "90s r&b"],
    interpretations: [
      { id: "rnb/90s", label: "90s r&b", type: "scene",
        summary: "silk slips, baggy denim with crop tops, hoop earrings, tender streetwear",
        tags: ["seductive", "streetwear", "minimal"],
        colors: ["white", "brown", "silver"], moods: ["soft", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "jazz", aliases: [],
    interpretations: [
      { id: "jazz/scene", label: "jazz", type: "sound",
        summary: "louche tailoring, knit ties, smoke-softened elegance",
        tags: ["tailored", "archival", "seductive"],
        colors: ["brown", "navy", "cream"], moods: ["nocturnal", "polished"], confidence: 0.7, provenance: P }] },

  // ---- MUSIC: artists (style readings only — never personal claims) ----------
  { kind: "music", name: "david bowie", aliases: ["bowie"],
    note: "one artist, many eras — pick a reading",
    interpretations: [
      { id: "bowie/ziggy", label: "Ziggy era", type: "era",
        summary: "glam armor — metallic one-pieces, flame color, theatrical shoulders",
        tags: ["avant-garde", "statement", "seductive"],
        colors: ["red", "gold", "silver"], moods: ["playful", "ethereal"], confidence: 0.75, provenance: P },
      { id: "bowie/duke", label: "Thin White Duke", type: "era",
        summary: "severe white-shirt-black-waistcoat tailoring, cabaret precision",
        tags: ["tailored", "minimal", "statement"],
        colors: ["white", "black"], moods: ["severe", "polished"], confidence: 0.75, provenance: P },
      { id: "bowie/berlin", label: "Berlin era", type: "era",
        summary: "workwear caps, plain shirts, art-studio anonymity",
        tags: ["minimal", "utilitarian", "independent"],
        colors: ["grey", "beige"], moods: ["restrained", "clinical"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "prince", aliases: [],
    interpretations: [
      { id: "prince/style", label: "Prince", type: "era",
        summary: "ruffled silk, purple velvet, heeled boots — flamboyance as power",
        tags: ["seductive", "statement", "avant-garde"],
        colors: ["burgundy", "gold", "white"], moods: ["romantic", "playful"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "sade", aliases: [],
    interpretations: [
      { id: "sade/style", label: "Sade", type: "era",
        summary: "gold hoops, slicked hair, perfect white shirts — minimal sensuality",
        tags: ["minimal", "seductive", "tailored"],
        colors: ["white", "gold", "black"], moods: ["soft", "polished"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "grace jones", aliases: [],
    interpretations: [
      { id: "grace-jones/style", label: "Grace Jones", type: "era",
        summary: "architectural shoulders, hooded silhouettes, geometry as glamour",
        tags: ["avant-garde", "statement", "minimal"],
        colors: ["black", "silver"], moods: ["severe", "ethereal"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "aaliyah", aliases: [],
    interpretations: [
      { id: "aaliyah/style", label: "Aaliyah", type: "era",
        summary: "baggy-over-bare — leather pants, bandeau tops, tommy-girl ease",
        tags: ["streetwear", "seductive", "minimal"],
        colors: ["black", "white", "silver"], moods: ["soft", "nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "music", name: "joy division", aliases: ["ian curtis"],
    interpretations: [
      { id: "joy-division/style", label: "Joy Division", type: "era",
        summary: "grey raincoats, thin shirts buttoned up, industrial-north austerity",
        tags: ["minimal", "independent", "archival"],
        colors: ["grey", "black"], moods: ["moody", "restrained"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "the cure", aliases: ["robert smith"],
    interpretations: [
      { id: "cure/style", label: "The Cure", type: "era",
        summary: "smeared lipstick, oversized black knits, romantic disarray",
        tags: ["independent", "seductive", "statement"],
        colors: ["black", "red"], moods: ["moody", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "nirvana", aliases: ["kurt cobain"],
    interpretations: [
      { id: "nirvana/style", label: "Nirvana", type: "era",
        summary: "thrifted cardigans, ripped denim, dresses over jeans — anti-style as style",
        tags: ["independent", "archival", "streetwear"],
        colors: ["olive", "brown", "red"], moods: ["raw"], confidence: 0.75, provenance: P }] },
  { kind: "music", name: "outkast", aliases: ["andre 3000"],
    interpretations: [
      { id: "outkast/style", label: "OutKast", type: "era",
        summary: "southern dandyism — plaid suits, silk scarves, color courage",
        tags: ["statement", "tailored", "independent"],
        colors: ["green", "pink", "gold"], moods: ["playful", "polished"], confidence: 0.7, provenance: P }] },

  // ---- CITIES ----------------------------------------------------------------
  { kind: "city", name: "london", aliases: [],
    interpretations: [
      { id: "london/savile", label: "tailoring row", type: "subculture",
        summary: "structured shoulders, checked wool, umbrella-ready formality",
        tags: ["tailored", "archival"],
        colors: ["grey", "navy", "brown"], moods: ["polished"], confidence: 0.7, provenance: P },
      { id: "london/road", label: "roadwear", type: "subculture",
        summary: "technical puffers, trackies, crossbody bags — UK street uniform",
        tags: ["streetwear", "utilitarian"],
        colors: ["black", "grey"], moods: ["raw"], confidence: 0.7, provenance: P },
      { id: "london/club-kids", label: "club kids", type: "subculture",
        summary: "fashion-school experiments, charity-shop couture, loud self-invention",
        tags: ["avant-garde", "independent", "statement"],
        colors: ["neon", "silver"], moods: ["playful", "nocturnal"], confidence: 0.65, provenance: P }] },
  { kind: "city", name: "new york", aliases: ["nyc", "new york city"],
    interpretations: [
      { id: "nyc/downtown", label: "downtown", type: "subculture",
        summary: "all-black layers, vintage leather, gallery-opening nonchalance",
        tags: ["independent", "minimal", "seductive"],
        colors: ["black"], moods: ["nocturnal"], confidence: 0.7, provenance: P },
      { id: "nyc/uptown", label: "uptown", type: "subculture",
        summary: "camel coats, polished loafers, generational tailoring",
        tags: ["tailored", "minimal", "archival"],
        colors: ["beige", "navy"], moods: ["polished"], confidence: 0.7, provenance: P },
      { id: "nyc/brooklyn", label: "brooklyn", type: "subculture",
        summary: "workwear remixed, vintage tees, bike-ready practicality",
        tags: ["independent", "utilitarian", "streetwear"],
        colors: ["brown", "olive"], moods: ["raw", "playful"], confidence: 0.65, provenance: P }] },
  { kind: "city", name: "los angeles", aliases: ["la"],
    interpretations: [
      { id: "la/skate", label: "skate", type: "subculture",
        summary: "sun-faded tees, loose chinos, shoes that show their mileage",
        tags: ["streetwear", "independent"],
        colors: ["white", "blue", "beige"], moods: ["playful", "raw"], confidence: 0.7, provenance: P },
      { id: "la/vintage", label: "vintage americana", type: "subculture",
        summary: "western boots, 70s denim, dead-stock tees — flea-market gold",
        tags: ["archival", "independent"],
        colors: ["brown", "red", "cream"], moods: ["romantic", "raw"], confidence: 0.7, provenance: P }] },
  { kind: "city", name: "seoul", aliases: [],
    interpretations: [
      { id: "seoul/minimal", label: "minimal", type: "subculture",
        summary: "monochrome layering, wide trousers, precise proportions",
        tags: ["minimal", "tailored", "avant-garde"],
        colors: ["black", "white", "grey"], moods: ["clinical", "polished"], confidence: 0.7, provenance: P },
      { id: "seoul/street", label: "street", type: "subculture",
        summary: "oversized everything, techwear touches, idol-adjacent polish",
        tags: ["streetwear", "statement", "utilitarian"],
        colors: ["black", "neon"], moods: ["playful"], confidence: 0.7, provenance: P }] },
  { kind: "city", name: "copenhagen", aliases: [],
    interpretations: [
      { id: "copenhagen/scandi", label: "scandi minimal", type: "subculture",
        summary: "wool coats, bike-friendly layers, quiet perfect basics",
        tags: ["minimal", "utilitarian", "tailored"],
        colors: ["grey", "cream", "navy"], moods: ["soft", "restrained"], confidence: 0.7, provenance: P },
      { id: "copenhagen/color", label: "color school", type: "subculture",
        summary: "clashing brights, statement knits, joyful pattern math",
        tags: ["statement", "independent"],
        colors: ["pink", "green", "blue"], moods: ["playful"], confidence: 0.65, provenance: P }] },
  { kind: "city", name: "milan", aliases: [],
    interpretations: [
      { id: "milan/sartorial", label: "sartorial", type: "subculture",
        summary: "unlined jackets, silk scarves, sprezzatura confidence",
        tags: ["tailored", "seductive", "statement"],
        colors: ["navy", "brown", "cream"], moods: ["polished", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "city", name: "antwerp", aliases: [],
    interpretations: [
      { id: "antwerp/avant", label: "the academy lineage", type: "subculture",
        summary: "deconstruction, poetic volume, intellectual black",
        tags: ["avant-garde", "independent", "archival"],
        colors: ["black", "cream"], moods: ["ethereal", "severe"], confidence: 0.7, provenance: P }] },

  // ---- DECADES ---------------------------------------------------------------
  { kind: "decade", name: "20s", aliases: ["1920s", "twenties"],
    interpretations: [
      { id: "20s/deco", label: "deco evening", type: "scene",
        summary: "beaded drop-waists, silk lapels, champagne-hour geometry",
        tags: ["seductive", "statement", "archival", "tailored"],
        colors: ["gold", "black", "cream"], moods: ["romantic", "nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "decade", name: "40s", aliases: ["1940s", "forties"],
    interpretations: [
      { id: "40s/utility", label: "utility", type: "scene",
        summary: "ration-era workwear, high-waist trousers, make-do tailoring",
        tags: ["utilitarian", "tailored", "archival"],
        colors: ["olive", "brown", "navy"], moods: ["restrained", "raw"], confidence: 0.7, provenance: P }] },
  { kind: "decade", name: "50s", aliases: ["1950s", "fifties"],
    interpretations: [
      { id: "50s/rocknroll", label: "rock'n'roll", type: "scene",
        summary: "leather jackets, cuffed denim, white tees — the original uniform",
        tags: ["streetwear", "archival", "statement"],
        colors: ["black", "blue", "white"], moods: ["raw", "playful"], confidence: 0.75, provenance: P },
      { id: "50s/ivy", label: "ivy", type: "scene",
        summary: "sack blazers, penny loafers, campus-lawn ease",
        tags: ["tailored", "minimal", "archival"],
        colors: ["navy", "beige", "green"], moods: ["polished", "soft"], confidence: 0.75, provenance: P },
      { id: "50s/newlook", label: "new look", type: "scene",
        summary: "cinched waists, full skirts, glove-and-hat occasion dressing",
        tags: ["tailored", "seductive", "archival"],
        colors: ["cream", "pink", "black"], moods: ["romantic", "polished"], confidence: 0.7, provenance: P }] },
  { kind: "decade", name: "60s", aliases: ["1960s", "sixties"],
    interpretations: [
      { id: "60s/mod", label: "mod", type: "scene",
        summary: "slim suits, mini shifts, scooter-sharp graphics",
        tags: ["tailored", "minimal", "statement"],
        colors: ["black", "white", "red"], moods: ["playful", "polished"], confidence: 0.75, provenance: P },
      { id: "60s/space", label: "space age", type: "scene",
        summary: "silver vinyl, go-go boots, plastic-future optimism",
        tags: ["avant-garde", "statement"],
        colors: ["silver", "white"], moods: ["playful", "clinical"], confidence: 0.7, provenance: P },
      { id: "60s/hippie", label: "hippie", type: "scene",
        summary: "fringe, tie-dye, bare feet and embroidered denim",
        tags: ["independent", "gorp", "archival"],
        colors: ["brown", "orange", "green"], moods: ["soft", "playful"], confidence: 0.7, provenance: P }] },
  { kind: "decade", name: "80s", aliases: ["1980s", "eighties"],
    interpretations: [
      { id: "80s/power", label: "power dressing", type: "scene",
        summary: "shoulder pads, pinstripes, boardroom armor",
        tags: ["tailored", "statement"],
        colors: ["grey", "red", "navy"], moods: ["severe", "polished"], confidence: 0.75, provenance: P },
      { id: "80s/newwave", label: "new wave", type: "scene",
        summary: "asymmetric hair, skinny ties, synth-club geometry",
        tags: ["avant-garde", "statement", "independent"],
        colors: ["black", "neon", "white"], moods: ["playful", "nocturnal"], confidence: 0.7, provenance: P },
      { id: "80s/hiphop", label: "hip-hop", type: "scene",
        summary: "shell-toes with fat laces, tracksuits, rope chains",
        tags: ["streetwear", "statement", "archival"],
        colors: ["black", "gold", "red"], moods: ["playful", "aggressive"], confidence: 0.75, provenance: P }] },
  { kind: "decade", name: "2010s", aliases: ["tens"],
    interpretations: [
      { id: "2010s/normcore", label: "normcore", type: "scene",
        summary: "deliberate plainness — dad sneakers, straight-leg jeans, anonymous fleece",
        tags: ["minimal", "utilitarian"],
        colors: ["grey", "blue", "white"], moods: ["restrained"], confidence: 0.7, provenance: P },
      { id: "2010s/streetboom", label: "streetwear boom", type: "scene",
        summary: "drop-culture graphics, hyped sneakers, box-logo devotion",
        tags: ["streetwear", "statement"],
        colors: ["red", "white", "black"], moods: ["playful"], confidence: 0.75, provenance: P }] },

  // ---- SUBCULTURES & AESTHETICS ----------------------------------------------
  { kind: "aesthetic", name: "dark academia", aliases: ["darkacademia"],
    interpretations: [
      { id: "dark-academia/core", label: "dark academia", type: "aesthetic",
        summary: "tweed, worn leather satchels, candlelit-library layers",
        tags: ["tailored", "archival", "independent"],
        colors: ["brown", "green", "grey"], moods: ["moody", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "aesthetic", name: "old money", aliases: ["quiet luxury", "old-money"],
    interpretations: [
      { id: "old-money/core", label: "old money", type: "aesthetic",
        summary: "heirloom cashmere, riding boots, understatement as flex",
        tags: ["tailored", "minimal", "archival"],
        colors: ["beige", "navy", "cream"], moods: ["polished", "restrained"], confidence: 0.8, provenance: P }] },
  { kind: "aesthetic", name: "techwear", aliases: ["tech wear"],
    interpretations: [
      { id: "techwear/core", label: "techwear", type: "aesthetic",
        summary: "taped seams, modular straps, urban-stealth function",
        tags: ["utilitarian", "avant-garde", "streetwear"],
        colors: ["black", "grey"], moods: ["industrial", "clinical"], confidence: 0.8, provenance: P }] },
  { kind: "aesthetic", name: "gorpcore", aliases: ["gorp"],
    interpretations: [
      { id: "gorpcore/core", label: "gorpcore", type: "aesthetic",
        summary: "trail shells in the city, fleece layers, carabiner jewelry",
        tags: ["gorp", "utilitarian", "streetwear"],
        colors: ["olive", "orange", "black"], moods: ["raw", "playful"], confidence: 0.8, provenance: P }] },
  { kind: "aesthetic", name: "cottagecore", aliases: [],
    interpretations: [
      { id: "cottagecore/core", label: "cottagecore", type: "aesthetic",
        summary: "prairie dresses, hand-knits, bread-baking softness",
        tags: ["independent", "archival", "gorp"],
        colors: ["cream", "green", "brown"], moods: ["soft", "romantic"], confidence: 0.7, provenance: P }] },
  { kind: "aesthetic", name: "mob wife", aliases: ["mob-wife", "mobwife"],
    interpretations: [
      { id: "mob-wife/core", label: "mob wife", type: "aesthetic",
        summary: "big fur, bigger sunglasses, leopard and leather, unapologetic gold",
        tags: ["seductive", "statement", "tailored", "archival"],
        colors: ["black", "gold", "brown"], moods: ["nocturnal", "polished"], confidence: 0.75, provenance: P }] },
  { kind: "aesthetic", name: "balletcore", aliases: ["ballet core"],
    interpretations: [
      { id: "balletcore/core", label: "balletcore", type: "aesthetic",
        summary: "wrap knits, ribbon flats, rehearsal-room layers",
        tags: ["seductive", "minimal", "independent"],
        colors: ["pink", "cream", "grey"], moods: ["soft", "ethereal"], confidence: 0.7, provenance: P }] },
  { kind: "aesthetic", name: "western", aliases: ["cowboy", "americana"],
    interpretations: [
      { id: "western/core", label: "western", type: "aesthetic",
        summary: "pearl snaps, worn boots, turquoise and denim-on-denim",
        tags: ["archival", "independent", "statement"],
        colors: ["brown", "blue", "cream"], moods: ["raw", "romantic"], confidence: 0.75, provenance: P }] },
  { kind: "aesthetic", name: "military surplus", aliases: ["milsurp", "military"],
    interpretations: [
      { id: "milsurp/core", label: "military surplus", type: "aesthetic",
        summary: "field jackets, cargo utility, decommissioned toughness",
        tags: ["utilitarian", "archival", "gorp"],
        colors: ["olive", "grey", "black"], moods: ["raw", "severe"], confidence: 0.75, provenance: P }] },
  { kind: "aesthetic", name: "preppy", aliases: ["prep", "ivy style"],
    interpretations: [
      { id: "preppy/core", label: "preppy", type: "aesthetic",
        summary: "rugby stripes, boat shoes, cable knits over shoulders",
        tags: ["tailored", "minimal", "statement"],
        colors: ["navy", "red", "cream"], moods: ["playful", "polished"], confidence: 0.75, provenance: P }] },
  { kind: "aesthetic", name: "rockabilly", aliases: [],
    interpretations: [
      { id: "rockabilly/core", label: "rockabilly", type: "aesthetic",
        summary: "rolled denim, bowling shirts, pomade-and-chrome revival",
        tags: ["archival", "statement", "independent"],
        colors: ["red", "black", "blue"], moods: ["playful", "raw"], confidence: 0.7, provenance: P }] },
  { kind: "aesthetic", name: "coastal", aliases: ["coastal grandmother", "riviera"],
    interpretations: [
      { id: "coastal/core", label: "coastal", type: "aesthetic",
        summary: "linen everything, rope soles, salt-air neutrals",
        tags: ["minimal", "tailored"],
        colors: ["white", "beige", "blue"], moods: ["soft", "polished"], confidence: 0.7, provenance: P }] },

  // ---- ABSTRACT CONCEPTS (the brief's banana test) -----------------------------
  { kind: "concept", name: "rain", aliases: ["rainy day"],
    interpretations: [
      { id: "rain/read", label: "rain", type: "concept",
        summary: "slick technical shells, charcoal layers, umbrella-black romance",
        tags: ["utilitarian", "minimal", "gorp"],
        colors: ["grey", "black", "navy"], moods: ["moody", "soft"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "concrete", aliases: ["brutalist"],
    interpretations: [
      { id: "concrete/read", label: "concrete", type: "concept",
        summary: "monolithic greys, raw seams, heavy drape — buildings as clothes",
        tags: ["minimal", "avant-garde", "utilitarian"],
        colors: ["grey", "beige"], moods: ["industrial", "severe"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "gas station at night", aliases: ["gas station"],
    interpretations: [
      { id: "gas-station/read", label: "gas station at night", type: "concept",
        summary: "fluorescent-lit workwear, high-vis accents, road-trip loneliness",
        tags: ["utilitarian", "streetwear", "independent"],
        colors: ["neon", "black", "blue"], moods: ["nocturnal", "raw"], confidence: 0.6, provenance: P }] },
  { kind: "concept", name: "banana", aliases: [],
    interpretations: [
      { id: "banana/read", label: "banana", type: "concept",
        summary: "butter yellows, curved seams, tropical play — slightly absurd on purpose",
        tags: ["statement", "minimal", "independent"],
        colors: ["gold", "cream", "brown", "green"], moods: ["playful", "soft"], confidence: 0.6, provenance: P }] },
  { kind: "concept", name: "midnight", aliases: ["3am"],
    interpretations: [
      { id: "midnight/read", label: "midnight", type: "concept",
        summary: "ink layers, satin shine, clothes for hours that don't exist",
        tags: ["seductive", "minimal", "avant-garde"],
        colors: ["black", "navy", "silver"], moods: ["nocturnal", "moody"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "desert", aliases: [],
    interpretations: [
      { id: "desert/read", label: "desert", type: "concept",
        summary: "sun-bleached layers, loose drape, horizon-line neutrals",
        tags: ["gorp", "minimal", "utilitarian"],
        colors: ["beige", "brown", "orange"], moods: ["raw", "ethereal"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "ocean", aliases: ["sea"],
    interpretations: [
      { id: "ocean/read", label: "ocean", type: "concept",
        summary: "deep blues, fluid silhouettes, weathered rope textures",
        tags: ["minimal", "gorp", "seductive"],
        colors: ["navy", "blue", "white"], moods: ["soft", "ethereal"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "forest", aliases: ["woods"],
    interpretations: [
      { id: "forest/read", label: "forest", type: "concept",
        summary: "mossy layers, waxed cotton, quiet trail utility",
        tags: ["gorp", "independent", "utilitarian"],
        colors: ["green", "brown", "olive"], moods: ["soft", "raw"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "snow", aliases: ["winter"],
    interpretations: [
      { id: "snow/read", label: "snow", type: "concept",
        summary: "white-on-white layering, technical warmth, muffled silence",
        tags: ["minimal", "gorp", "utilitarian"],
        colors: ["white", "cream", "grey"], moods: ["soft", "clinical"], confidence: 0.65, provenance: P }] },
  { kind: "concept", name: "rust", aliases: [],
    interpretations: [
      { id: "rust/read", label: "rust", type: "concept",
        summary: "oxidized oranges, distressed metal hardware, beautiful decay",
        tags: ["independent", "archival", "utilitarian"],
        colors: ["orange", "brown", "red"], moods: ["raw", "industrial"], confidence: 0.6, provenance: P }] },
  { kind: "concept", name: "fog", aliases: ["mist"],
    interpretations: [
      { id: "fog/read", label: "fog", type: "concept",
        summary: "translucent layers, blurred silhouettes, grey softness",
        tags: ["minimal", "avant-garde"],
        colors: ["grey", "white"], moods: ["ethereal", "soft"], confidence: 0.6, provenance: P }] },

  // ---- ART & DESIGN MOVEMENTS ---------------------------------------------------
  { kind: "art", name: "bauhaus", aliases: [],
    interpretations: [
      { id: "bauhaus/read", label: "bauhaus", type: "movement",
        summary: "primary-color blocking, functional geometry, form follows wearer",
        tags: ["minimal", "avant-garde", "utilitarian"],
        colors: ["red", "blue", "black"], moods: ["clinical", "playful"], confidence: 0.7, provenance: P }] },
  { kind: "art", name: "brutalism", aliases: [],
    interpretations: [
      { id: "brutalism/read", label: "brutalism", type: "movement",
        summary: "raw monumental volumes, exposed construction, concrete palette",
        tags: ["avant-garde", "minimal", "utilitarian"],
        colors: ["grey", "black"], moods: ["severe", "industrial"], confidence: 0.7, provenance: P }] },
  { kind: "art", name: "art deco", aliases: ["deco"],
    interpretations: [
      { id: "art-deco/read", label: "art deco", type: "movement",
        summary: "sunburst geometry, gold-on-black, machine-age glamour",
        tags: ["statement", "seductive", "archival"],
        colors: ["gold", "black", "cream"], moods: ["polished", "nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "art", name: "baroque", aliases: [],
    interpretations: [
      { id: "baroque/read", label: "baroque", type: "movement",
        summary: "gilded excess, brocade, drama in every fold",
        tags: ["statement", "seductive", "avant-garde"],
        colors: ["gold", "burgundy", "black"], moods: ["romantic", "nocturnal"], confidence: 0.7, provenance: P }] },
  { kind: "art", name: "surrealism", aliases: [],
    interpretations: [
      { id: "surrealism/read", label: "surrealism", type: "movement",
        summary: "trompe l'oeil, displaced objects, dream logic worn straight-faced",
        tags: ["avant-garde", "statement", "independent"],
        colors: ["red", "blue", "black"], moods: ["playful", "ethereal"], confidence: 0.7, provenance: P }] },
  { kind: "art", name: "wabi-sabi", aliases: ["wabi sabi"],
    interpretations: [
      { id: "wabi-sabi/read", label: "wabi-sabi", type: "movement",
        summary: "visible mending, undyed textures, imperfection honored",
        tags: ["independent", "minimal", "archival", "avant-garde"],
        colors: ["cream", "grey", "brown"], moods: ["soft", "restrained"], confidence: 0.7, provenance: P }] },
];

// name/alias (lowercased) → record. Built once per process.
let INDEX = null;
export function cultureIndex() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const rec of CULTURE) {
    INDEX.set(rec.name, rec);
    for (const a of rec.aliases || []) INDEX.set(a.toLowerCase(), rec);
  }
  return INDEX;
}

export function lookupCulture(query) {
  const q = String(query || "").toLowerCase().trim().replace(/\s+/g, " ");
  return cultureIndex().get(q) || null;
}
