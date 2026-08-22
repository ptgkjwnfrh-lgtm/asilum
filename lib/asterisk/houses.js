// lib/asterisk/houses.js — where the houses are from.
//
// "japanese coat" is one of the most ordinary things a person types into a
// fashion search, and this catalog is full of Japanese houses — Comme des
// Garçons, Junya Watanabe, Sacai, Undercover, Yohji Yamamoto, Kapital,
// Needles, Visvim, Auralee, Snow Peak, And Wander, Kaptain Sunshine. The
// engine could not answer it, because nothing anywhere recorded where a
// house is from. This file is that record.
//
// WHAT THIS IS. Curated editorial knowledge, in the same class as
// lib/asterisk/culture.js and lib/search/mappings-seed.js — not scraped, not
// model-generated, and NOT presented as sourced fact. Every row carries a
// `basis`: the one-line reason the entry says what it says. Provenance is
// stamped below and the whole table is reviewable in one screen, on purpose.
//
// WHAT IT IS NOT. It is not a nationality claim about a designer. A house has
// a base; a person has a passport; those are different facts and conflating
// them is how a record becomes wrong. Where the two diverge — Balenciaga,
// Off-White, Maison Margiela, Kiko Kostadinov — the note says so plainly.
//
// TWO COUNTRIES, WHEN TWO ARE TRUE. Some houses moved. Rick Owens was founded
// in Los Angeles and has run out of Paris since 2003; Vetements was founded in
// Paris and moved to Zurich; Helmut Lang started in Vienna and has been a New
// York label since 1997. `country` is where the house operates now and
// `foundedIn` is where it began. A query matches EITHER, because both readings
// of "american Rick Owens" are things a person can reasonably mean, and
// refusing one of them would be a smaller lie but still a lie.
//
// UNKNOWN IS A VALUE. A house this file is not confident about is simply
// absent, and `originCoverage()` reports the hole. Guessing to fill a table is
// how a curated record turns into a fabricated one.

// SHORT FORMS THE TRADE ACTUALLY USES (Aug 22). MEASURED: "cdg" returned 681
// items topped by JW Anderson, "ysl" 624 topped by Dries Van Noten, and "raf"
// buried all twelve Raf Simons pieces at rank 306 under a note that named
// him — each routed to the cultural tier and passed straight over the house
// that is IN STOCK. Meanwhile "rick", "yohji", "dries" and "margiela" already
// worked, because they happen to be whole words inside the stored name.
//
// Curated with the same standard as the origin table: only forms in common
// trade use, only for houses this catalog stocks, and never a form short
// enough to collide with an ordinary word. "sl" and "cd" are deliberately
// absent for that reason.
export const HOUSE_SHORT_FORMS = Object.assign(Object.create(null), {
  "Comme des Garçons": ["cdg", "comme"],
  "Maison Margiela": ["mmm", "margiela", "maison margiela"],
  "Saint Laurent": ["ysl", "yves saint laurent"],
  "Raf Simons": ["raf"],
  "Rick Owens": ["rick", "ro"],
  "Louis Vuitton": ["lv"],
  "Bottega Veneta": ["bottega", "bv"],
  "Aimé Leon Dore": ["ald", "aime leon dore"],
  "Yohji Yamamoto": ["yohji"],
  "Junya Watanabe": ["junya"],
  "Dries Van Noten": ["dries", "dvn"],
  "Acne Studios": ["acne"],
  "Nike ACG": ["acg"],
  "Carhartt WIP": ["carhartt", "wip"],
  "Stone Island": ["stoney"],
  "Jean Paul Gaultier": ["jpg"],
  "Undercover": ["uc"],
  "Kiko Kostadinov": ["kiko"],
  "Willy Chavarria": ["willy"],
  "Martine Rose": ["martine"],
  "Marine Serre": ["marine serre"],
  "Wales Bonner": ["wales"],
  "Ann Demeulemeester": ["ann d"],
  "Y/Project": ["y project", "yproject"],
});

export const HOUSE_ORIGIN_PROVENANCE = {
  method: "curated-editorial",
  curatedAt: "2026-08-21",
  reviewNote:
    "Curated from general fashion knowledge in one pass, no web research run. " +
    "Corrections belong in this table with an updated basis line, never in a " +
    "silent rename. A row that becomes contested should be deleted, not softened.",
};

/**
 * brand (exact catalog string) → { country, foundedIn?, city?, basis }
 * `country` is where the house operates today.
 */
export const HOUSES = {
  "Acne Studios": { country: "Sweden", city: "Stockholm", basis: "founded in Stockholm in 1996" },
  "Adidas Originals": { country: "Germany", city: "Herzogenaurach", basis: "the heritage line of the German sportswear company" },
  "Aimé Leon Dore": { country: "United States", city: "New York", basis: "founded in Queens, New York, in 2014" },
  "Alaïa": { country: "France", city: "Paris", basis: "a Paris house; its founder Azzedine Alaïa was Tunisian-born" },
  "And Wander": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 2011 by two former Issey Miyake designers" },
  "Ann Demeulemeester": { country: "Belgium", city: "Antwerp", basis: "one of the Antwerp Six" },
  "Arc'teryx": { country: "Canada", city: "North Vancouver", basis: "founded in North Vancouver in 1989" },
  "Auralee": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 2015" },
  "Balenciaga": { country: "France", city: "Paris", basis: "a Paris house since 1937; Cristóbal Balenciaga was Spanish and opened in San Sebastián" },
  "Bianca Saunders": { country: "United Kingdom", city: "London", basis: "founded in London in 2017" },
  "Bode": { country: "United States", city: "New York", basis: "founded in New York in 2016" },
  "Bottega Veneta": { country: "Italy", city: "Vicenza", basis: "founded in Vicenza in 1966" },
  "Carhartt WIP": { country: "Germany", foundedIn: "United States", basis: "Work In Progress is the European arm, based at Weil am Rhein, of the American workwear company" },
  "Cav Empt": { country: "Japan", basis: "a Japanese label founded in 2011; co-founder Toby Feltwell is British" },
  "Celine": { country: "France", city: "Paris", basis: "founded in Paris in 1945" },
  "Chrome Hearts": { country: "United States", city: "Los Angeles", basis: "founded in Los Angeles in 1988" },
  "Comme des Garçons": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 1969 by Rei Kawakubo" },
  "Craig Green": { country: "United Kingdom", city: "London", basis: "founded in London in 2012" },
  "Dior Men": { country: "France", city: "Paris", basis: "the menswear line of the Paris house" },
  "Dries Van Noten": { country: "Belgium", city: "Antwerp", basis: "one of the Antwerp Six" },
  "ERL": { country: "United States", city: "Venice", basis: "founded in Venice, California" },
  "Fear of God": { country: "United States", city: "Los Angeles", basis: "founded in Los Angeles in 2013" },
  "Fendi": { country: "Italy", city: "Rome", basis: "founded in Rome in 1925" },
  "Ferragamo": { country: "Italy", city: "Florence", basis: "founded in Florence in 1927" },
  "Gucci": { country: "Italy", city: "Florence", basis: "founded in Florence in 1921" },
  "Helmut Lang": { country: "United States", foundedIn: "Austria", city: "New York", basis: "founded in Vienna in 1986, a New York label since 1997" },
  "JW Anderson": { country: "United Kingdom", city: "London", basis: "founded in London in 2008" },
  "Jil Sander": { country: "Italy", foundedIn: "Germany", city: "Milan", basis: "founded in Hamburg in 1968, run from Milan today" },
  "Junya Watanabe": { country: "Japan", city: "Tokyo", basis: "a Comme des Garçons line, Tokyo" },
  "Kapital": { country: "Japan", city: "Kojima", basis: "founded in Kojima, Okayama — Japan's denim district" },
  "Kaptain Sunshine": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 2013" },
  "Khaite": { country: "United States", city: "New York", basis: "founded in New York in 2016" },
  "Kiko Kostadinov": { country: "United Kingdom", city: "London", basis: "founded in London in 2016; the designer is Bulgarian" },
  "Lemaire": { country: "France", city: "Paris", basis: "founded in Paris in 1991" },
  "Loewe": { country: "Spain", city: "Madrid", basis: "founded in Madrid in 1846" },
  "Louis Vuitton": { country: "France", city: "Paris", basis: "founded in Paris in 1854" },
  "Maison Margiela": { country: "France", city: "Paris", basis: "founded in Paris in 1988; Martin Margiela is Belgian and of the Antwerp Six" },
  "Marine Serre": { country: "France", city: "Paris", basis: "founded in Paris in 2017" },
  "Martine Rose": { country: "United Kingdom", city: "London", basis: "founded in London in 2007" },
  "Miu Miu": { country: "Italy", city: "Milan", basis: "the Prada sister line, Milan" },
  "Needles": { country: "Japan", city: "Tokyo", basis: "a Nepenthes line, Tokyo" },
  "Nike ACG": { country: "United States", city: "Beaverton", basis: "the All Conditions Gear line of the Oregon company" },
  "Off-White": { country: "Italy", city: "Milan", basis: "founded in Milan in 2012; Virgil Abloh was American" },
  "Our Legacy": { country: "Sweden", city: "Stockholm", basis: "founded in Stockholm in 2005" },
  "Patagonia": { country: "United States", city: "Ventura", basis: "founded in Ventura, California, in 1973" },
  "Prada": { country: "Italy", city: "Milan", basis: "founded in Milan in 1913" },
  "Raf Simons": { country: "Belgium", city: "Antwerp", basis: "founded in Antwerp in 1995" },
  "Rick Owens": { country: "France", foundedIn: "United States", city: "Paris", basis: "founded in Los Angeles in 1994, run from Paris since 2003" },
  "Sacai": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 1999" },
  "Saint Laurent": { country: "France", city: "Paris", basis: "founded in Paris in 1961" },
  "Salomon": { country: "France", city: "Annecy", basis: "founded in Annecy in 1947" },
  "Snow Peak": { country: "Japan", city: "Sanjō", basis: "founded in Sanjō, Niigata, in 1958" },
  "Stone Island": { country: "Italy", city: "Ravarino", basis: "founded in 1982, part of the Ravarino-based group" },
  "Stüssy": { country: "United States", city: "Laguna Beach", basis: "founded in Laguna Beach, California, around 1980" },
  "Supreme": { country: "United States", city: "New York", basis: "founded in New York in 1994" },
  "The Row": { country: "United States", city: "New York", basis: "founded in Los Angeles in 2006, run from New York" },
  "Undercover": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 1990 by Jun Takahashi" },
  "Vetements": { country: "Switzerland", foundedIn: "France", city: "Zurich", basis: "founded in Paris in 2014, moved to Zurich in 2018" },
  "Visvim": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 2000 by Hiroki Nakamura" },
  "Wales Bonner": { country: "United Kingdom", city: "London", basis: "founded in London in 2014" },
  "Willy Chavarria": { country: "United States", city: "New York", basis: "founded in New York in 2015" },
  "Y/Project": { country: "France", city: "Paris", basis: "founded in Paris in 2010" },
  "Yohji Yamamoto": { country: "Japan", city: "Tokyo", basis: "founded in Tokyo in 1981" },
  // DELIBERATELY ABSENT: Namacheko. Kurdish-Swedish designers showing in
  // Paris, and this file is not confident enough about the house's base to
  // write it down. originCoverage() counts it as the hole it is.
};

const norm = (s) => String(s || "").toLowerCase().trim();
const BY_NORM = new Map(Object.entries(HOUSES).map(([b, v]) => [norm(b), { brand: b, ...v }]));

const SHORT_TO_HOUSE = new Map();
for (const [house, forms] of Object.entries(HOUSE_SHORT_FORMS)) {
  for (const f of forms) SHORT_TO_HOUSE.set(norm(f), house);
}

/**
 * The house a trade short-form names, restricted to what this pool stocks.
 * A form for a house nobody carries resolves to nothing — "jpg" is real
 * vocabulary and Jean Paul Gaultier is not in this catalog.
 */
export function houseForShortForm(text, stockedBrands = []) {
  const house = SHORT_TO_HOUSE.get(norm(text));
  if (!house) return null;
  if (!stockedBrands.length) return house;
  const stocked = new Set(stockedBrands.map(norm));
  return stocked.has(norm(house)) ? house : null;
}

/** What this file knows about one brand, or null. Never guesses. */
export function houseOrigin(brand) {
  return BY_NORM.get(norm(brand)) || null;
}

/** Is this brand from `country`, counting where it began as well as where it is? */
export function houseIsFrom(brand, countries) {
  const rec = houseOrigin(brand);
  if (!rec) return false;
  const want = countries instanceof Set ? countries : new Set([countries]);
  return want.has(rec.country) || (rec.foundedIn ? want.has(rec.foundedIn) : false);
}

/** How much of a brand list this table covers — the hole, said out loud. */
export function originCoverage(brands = []) {
  const seen = [...new Set(brands.map(norm).filter(Boolean))];
  const known = seen.filter((b) => BY_NORM.has(b));
  return { total: seen.length, known: known.length, missing: seen.filter((b) => !BY_NORM.has(b)) };
}
