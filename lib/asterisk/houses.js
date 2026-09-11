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
  "11 by Boris Bidjan Saberi": ["11bbs"],
  "A Bathing Ape": ["bape"],
  "A-Cold-Wall*": ["acw"],
  "A.P.C.": ["apc"],
  "Acne Studios": ["acne"],
  "Aimé Leon Dore": ["ald", "aime leon dore"],
  "Ann Demeulemeester": ["ann d"],
  "Black Comme des Garçons": ["cdg black", "black cdg"],
  "Boris Bidjan Saberi": ["bbs"],
  "Bottega Veneta": ["bottega", "bv"],
  "C.P. Company": ["cp company"],
  "Cactus Plant Flea Market": ["cpfm"],
  "Calvin Klein": ["ck"],
  "Calvin Klein 205W39NYC": ["205w39nyc"],
  "Carhartt WIP": ["wip"],
  "Carol Christian Poell": ["ccp"],
  "Comme des Garçons": ["cdg", "comme"],
  "Comme des Garçons Homme": ["cdg homme"],
  "Comme des Garçons Homme Plus": ["cdg homme plus", "homme plus"],
  "Comme des Garçons Play": ["cdg play", "play"],
  "Comme des Garçons Shirt": ["cdg shirt"],
  "Corteiz": ["crtz"],
  "Costume National": ["cn"],
  "Diet Butcher Slim Skin": ["dbss"],
  "Dolce & Gabbana": ["d&g"],
  "Dr. Martens": ["docs", "dms"],
  "Dries Van Noten": ["dries", "dvn"],
  "Ecko Unltd.": ["ecko"],
  "Emporio Armani": ["ea"],
  "Enfants Riches Déprimés": ["erd"],
  "Engineered Garments": ["eg"],
  "Fragment Design": ["fragment"],
  "Fucking Awesome": ["fa"],
  "Homme Plissé Issey Miyake": ["homme plissé"],
  "Hood By Air": ["hba"],
  "Hysteric Glamour": ["hg", "hysteric"],
  "If Six Was Nine": ["ifsixwasnine"],
  "Jean Paul Gaultier": ["jpg"],
  "Junya Watanabe": ["junya"],
  "Junya Watanabe MAN": ["jw man"],
  "Kiko Kostadinov": ["kiko"],
  "L.G.B. (Le Grand Bleu)": ["lgb"],
  "Levi's Vintage Clothing": ["lvc"],
  "Louis Vuitton": ["lv"],
  "m.a+ (Maurizio Amadei)": ["ma+"],
  "Maison Margiela": ["mmm", "margiela", "maison margiela"],
  "Margaret Howell": ["mhl"],
  "Marine Serre": ["marine serre"],
  "Martine Rose": ["martine"],
  "Massimo Osti Studio": ["mos"],
  "Mihara Yasuhiro": ["mihara"],
  "New Balance": ["nb"],
  "Nike ACG": ["acg"],
  "Norse Projects": ["norse"],
  "Number (N)ine": ["n9", "number nine"],
  "Pleats Please Issey Miyake": ["pleats please"],
  "Post Archive Faction": ["paf"],
  "Pure Blue Japan": ["pbj"],
  "Raf Simons": ["raf"],
  "Ralph Lauren": ["rl"],
  "Represent": ["repclo"],
  "Rick Owens": ["rick", "ro"],
  "Rick Owens DRKSHDW": ["drkshdw"],
  "Saint Laurent": ["ysl", "yves saint laurent"],
  "South2 West8": ["s2w8"],
  "Stone Island": ["stoney"],
  "Stone Island Shadow Project": ["sis"],
  "TakahiroMiyashita TheSoloist.": ["thesoloist", "the soloist"],
  "The North Face": ["tnf"],
  "Tom Ford": ["tf"],
  "Tommy Hilfiger": ["th"],
  "Undercover": ["uc"],
  "United Arrows": ["ua"],
  "Wales Bonner": ["wales"],
  "Willy Chavarria": ["willy"],
  "Y-3": ["y3"],
  "Y/Project": ["y project", "yproject"],
  "Yohji Yamamoto": ["yohji"],
  "Yohji Yamamoto Pour Homme": ["yyph"],
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
  "032c": { country: "Germany", city: "Berlin", founded: 2000, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], basis: "founded in Berlin in 2000 as a magazine by Joerg Koch, expanded into ready-to-wear from 2016-2018" },
  "11 by Boris Bidjan Saberi": { country: "Spain", city: "Barcelona", parent: "Boris Bidjan Saberi", founded: 2013, tags: ["STREETWEAR", "UTILITARIAN", "INDEPENDENT"], basis: "streetwear-priced diffusion line of Boris Bidjan Saberi, launched 2013 from the same Barcelona studio" },
  "14th Addiction": { country: "Japan", city: "Tokyo", founded: 2007, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Japan in 2007 by Teruki Uchise, distressed vintage-inspired leather goods" },
  "20471120": { country: "Japan", city: "Tokyo", founded: 1992, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in Osaka in 1992 (as Bellissima until 1994), later based Tokyo; Harajuku-era surrealist, anime-inflected label" },
  "A Bathing Ape": { country: "Hong Kong", foundedIn: "Japan", city: "Hong Kong", founded: 1993, tags: ["STREETWEAR", "STATEMENT"], aka: ["bape", "a bathing ape"], basis: "founded in Ura-Harajuku, Tokyo in 1993 by Nigo; the designer is Japanese" },
  "A Kind of Guise": { country: "Germany", city: "Munich", founded: 2009, tags: ["TAILORED", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Munich in 2009 by Yasar Ceviker and Susi Streich" },
  "A-Cold-Wall*": { country: "United Kingdom", city: "London", founded: 2015, tags: ["AVANT-GARDE", "UTILITARIAN", "STATEMENT"], aka: ["a cold wall", "acw"], basis: "founded in London in 2015 by Samuel Ross" },
  "A.P.C.": { country: "France", city: "Paris", founded: 1987, tags: ["MINIMAL", "INDEPENDENT", "TAILORED"], aka: ["apc"], basis: "founded in Paris in 1987 by French designer Jean Touitou (Atelier de Production et de Création)" },
  "Acne Studios": { country: "Sweden", city: "Stockholm", tags: ["MINIMAL", "INDEPENDENT", "TAILORED"], basis: "founded in Stockholm in 1996" },
  "Acronym": { country: "Germany", city: "Berlin", founded: 1994, tags: ["UTILITARIAN", "AVANT-GARDE", "GORP"], basis: "founded in Munich in 1994 by Errolson Hugh and Michaela Sachenbacher; later based in Berlin" },
  "Ader Error": { country: "South Korea", city: "Seoul", founded: 2014, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], basis: "founded in Seoul in 2014 by an anonymous design collective" },
  "Adidas Originals": { country: "Germany", city: "Herzogenaurach", tags: ["STREETWEAR", "MINIMAL"], aka: ["adidas"], basis: "the heritage line of the German sportswear company" },
  "Affliction": { country: "United States", city: "Seal Beach", founded: 2005, tags: ["STATEMENT", "ARCHIVAL", "STREETWEAR"], basis: "founded in Seal Beach, California in 2005 by Courtney Dubar, Todd Beard, Eric Foss and Clifton Chason" },
  "agnès b.": { country: "France", city: "Paris", founded: 1976, tags: ["MINIMAL", "INDEPENDENT", "ARCHIVAL"], basis: "founded in Paris in 1976 by French designer Agnès Troublé" },
  "Ahluwalia": { country: "United Kingdom", city: "London", founded: 2018, tags: ["ARCHIVAL", "INDEPENDENT", "UTILITARIAN"], basis: "founded in London in 2018 by British-Indian-Nigerian designer Priya Ahluwalia" },
  "Aimé Leon Dore": { country: "United States", city: "New York", tags: ["STREETWEAR", "TAILORED", "ARCHIVAL"], aka: ["aime leon dore"], basis: "founded in Queens, New York, in 2014" },
  "Alaïa": { country: "France", city: "Paris", tags: ["SEDUCTIVE", "TAILORED", "ARCHIVAL"], aka: ["alaia", "azzedine alaia"], basis: "a Paris house; its founder Azzedine Alaïa was Tunisian-born" },
  "Alden": { country: "United States", city: "Middleborough", founded: 1884, tags: ["TAILORED", "ARCHIVAL", "UTILITARIAN"], basis: "founded in Middleborough, Massachusetts in 1884 by Charles H. Alden" },
  "Alexander McQueen": { country: "United Kingdom", city: "London", founded: 1992, tags: ["AVANT-GARDE", "STATEMENT", "SEDUCTIVE"], aka: ["mcqueen"], basis: "founded in London in 1992 by British designer Lee Alexander McQueen" },
  "Alpha Industries": { country: "United States", city: "Chantilly", founded: 1959, tags: ["UTILITARIAN", "ARCHIVAL", "STREETWEAR"], basis: "founded in Knoxville, Tennessee in 1959 by Samuel Gelber; now based in Chantilly, Virginia" },
  "Ambush": { country: "Japan", city: "Tokyo", founded: 2012, tags: ["STREETWEAR", "STATEMENT", "AVANT-GARDE"], basis: "launched in Tokyo in 2012 by Yoon Ahn and Verbal as a jewellery label; Yoon Ahn is Korean-American" },
  "Amiri": { country: "United States", city: "Los Angeles", founded: 2014, tags: ["STREETWEAR", "SEDUCTIVE", "STATEMENT"], basis: "founded in Los Angeles in 2014 by Mike Amiri" },
  "And Wander": { country: "Japan", city: "Tokyo", tags: ["GORP", "UTILITARIAN", "MINIMAL"], basis: "founded in Tokyo in 2011 by two former Issey Miyake designers" },
  "Andersson Bell": { country: "South Korea", city: "Seoul", founded: 2014, tags: ["MINIMAL", "TAILORED", "INDEPENDENT"], basis: "founded in Seoul in 2014 by Dohun Kim" },
  "Ann Demeulemeester": { country: "Italy", foundedIn: "Belgium", city: "Milan", tags: ["AVANT-GARDE", "ARCHIVAL", "INDEPENDENT"], basis: "one of the Antwerp Six; the company was relocated to Milan after Claudio Antonioli bought it in 2020" },
  "Anrealage": { country: "Japan", city: "Tokyo", founded: 2003, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in Tokyo in 2003 by Kunihiko Morinaga, known for light- and heat-reactive fabric technology" },
  "Arc'teryx": { country: "Canada", city: "North Vancouver", tags: ["GORP", "UTILITARIAN"], aka: ["arcteryx", "arc teryx"], basis: "founded in North Vancouver in 1989" },
  "Arket": { country: "Sweden", city: "Stockholm", founded: 2017, tags: ["MINIMAL", "UTILITARIAN", "ARCHIVAL"], basis: "launched in Stockholm in 2017 as a line of the H&M Group" },
  "Asics": { country: "Japan", city: "Kobe", founded: 1949, tags: ["STREETWEAR", "GORP", "UTILITARIAN"], basis: "founded in Kobe, Japan in 1949 by Kihachiro Onitsuka as Onitsuka Co." },
  "Attachment": { country: "Japan", city: "Tokyo", founded: 1999, tags: ["MINIMAL", "TAILORED", "AVANT-GARDE"], kb: false, basis: "founded in Tokyo in 1999 by Kazuyuki Kumagai (trained under Yohji Yamamoto, then Issey Miyake 1990–1995), drape-heavy minimalist tailoring" },
  "Auralee": { country: "Japan", city: "Tokyo", tags: ["MINIMAL", "TAILORED"], basis: "founded in Tokyo in 2015" },
  "Avirex": { country: "United States", city: "Bernardsville", founded: 1975, tags: ["UTILITARIAN", "ARCHIVAL", "STREETWEAR"], basis: "founded in New York in 1975 by Jeff Clyman" },
  "Awake NY": { country: "United States", city: "New York", founded: 2012, tags: ["STREETWEAR", "INDEPENDENT", "STATEMENT"], basis: "founded in New York City in 2012 by Angelo Baque" },
  "Balenciaga": { country: "France", foundedIn: "Spain", city: "Paris", tags: ["STATEMENT", "STREETWEAR", "AVANT-GARDE"], basis: "founded in San Sebastián in 1917 by Cristóbal Balenciaga, who was Spanish; a Paris house since 1937" },
  "Balmain": { country: "France", city: "Paris", founded: 1945, tags: ["STATEMENT", "TAILORED", "SEDUCTIVE"], basis: "founded in Paris in 1945 by French designer Pierre Balmain" },
  "Barbour": { country: "United Kingdom", city: "South Shields", founded: 1894, tags: ["UTILITARIAN", "ARCHIVAL", "TAILORED"], basis: "founded in South Shields, England in 1894 by John Barbour" },
  "Beams": { country: "Japan", city: "Tokyo", founded: 1976, tags: ["ARCHIVAL", "INDEPENDENT", "MINIMAL"], basis: "founded in Harajuku, Tokyo in 1976 by Etsuzo Shitara as an American-lifestyle select shop" },
  "Beauty:Beast": { country: "Japan", city: "Tokyo", founded: 1990, tags: ["STATEMENT", "SEDUCTIVE", "AVANT-GARDE"], basis: "founded in Ura-Harajuku, Tokyo in 1990 by Takao Yamashita, punk meets fairytale/bondage sensuality" },
  "Belstaff": { country: "United Kingdom", city: "London", founded: 1924, tags: ["UTILITARIAN", "ARCHIVAL", "STATEMENT"], basis: "founded in Longton, Stoke-on-Trent, England in 1924 by Eli Belovitch and his son-in-law Harry Grosberg" },
  "Ben Davis": { country: "United States", city: "San Rafael", founded: 1935, tags: ["UTILITARIAN", "STREETWEAR", "INDEPENDENT"], basis: "founded in San Francisco in 1935 by Ben Davis and his father Simon Davis" },
  "Ben Sherman": { country: "United Kingdom", city: "Brighton", founded: 1963, tags: ["ARCHIVAL", "TAILORED", "STREETWEAR"], basis: "founded in Brighton, England in 1963 by Arthur Benjamin Sugarman" },
  "Bernhard Willhelm": { country: "United States", foundedIn: "Germany", city: "Los Angeles", founded: 1998, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in 1998 by German designer Bernhard Willhelm with Jutta Kraus; company relocated to Los Angeles in 2013" },
  "Bianca Chandon": { country: "United States", city: "New York", founded: 2013, tags: ["INDEPENDENT", "STATEMENT", "ARCHIVAL"], basis: "founded in New York City circa 2013 by pro skater Alex Olson, sibling project to his Call Me 917" },
  "Bianca Saunders": { country: "France", foundedIn: "United Kingdom", city: "Paris", tags: ["TAILORED", "AVANT-GARDE", "STATEMENT"], basis: "founded in London in 2017; the label has shown and run from Paris since its 2022 runway debut" },
  "Bimba y Lola": { country: "Spain", city: "Mos", founded: 2005, tags: ["STATEMENT", "TAILORED", "INDEPENDENT"], basis: "founded in Galicia, Spain in 2005 by sisters María and Uxía Domínguez" },
  "Birkenstock": { country: "Germany", city: "Linz am Rhein", founded: 1774, tags: ["MINIMAL", "INDEPENDENT", "GORP"], basis: "family shoemaking traced to Johannes Birkenstock in Langen-Bergheim, Germany in 1774" },
  "Black Comme des Garçons": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 2009, tags: ["MINIMAL", "TAILORED", "STATEMENT"], basis: "CDG's lower-priced diffusion line, Tokyo, launched 2009 during the global recession" },
  "Blumarine": { country: "Italy", city: "Carpi", founded: 1977, tags: ["SEDUCTIVE", "STATEMENT"], basis: "founded in Carpi, Italy in 1977 by Anna Molinari and Gianpaolo Tarabini (company Blufin S.p.A.)" },
  "Bode": { country: "United States", city: "New York", tags: ["ARCHIVAL", "INDEPENDENT", "TAILORED"], basis: "founded in New York in 2016" },
  "Boris Bidjan Saberi": { country: "Spain", city: "Barcelona", founded: 2006, tags: ["AVANT-GARDE", "UTILITARIAN", "ARCHIVAL"], aka: ["bbs"], basis: "founded in Barcelona in 2006; Saberi is German (born Munich, to a German mother and Persian father), regularly shows in Paris" },
  "Bottega Veneta": { country: "Italy", city: "Vicenza", tags: ["MINIMAL", "STATEMENT", "TAILORED"], basis: "founded in Vicenza in 1966" },
  "Botter": { country: "France", city: "Paris", founded: 2017, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Paris in 2017; Botter is from Curaçao (raised in Amsterdam), Herrebrugh is Dominican-Dutch" },
  "Brain Dead": { country: "United States", city: "Los Angeles", founded: 2014, tags: ["STREETWEAR", "INDEPENDENT", "STATEMENT"], basis: "founded in Los Angeles in 2014 by Kyle Ng and Ed Davis" },
  "Brunello Cucinelli": { country: "Italy", city: "Solomeo", founded: 1978, tags: ["TAILORED", "MINIMAL"], basis: "founded in 1978 by Brunello Cucinelli; based in Solomeo, Umbria" },
  "Burberry": { country: "United Kingdom", city: "London", founded: 1856, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Basingstoke, England in 1856 by Thomas Burberry" },
  "Buzz Rickson's": { country: "Japan", city: "Tokyo", founded: 1993, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "a Toyo Enterprise (Tokyo, est. 1965) label launched in 1993, military flight-jacket and aviation-wear reproduction" },
  "C.P. Company": { country: "Italy", city: "Bologna", founded: 1971, tags: ["UTILITARIAN", "GORP", "ARCHIVAL"], aka: ["cp company", "cpcompany"], basis: "founded in Bologna in 1971 by Massimo Osti (originally 'Chester Perry', renamed C.P. Company in 1978)" },
  "Cacharel": { country: "France", city: "Paris", founded: 1958, tags: ["MINIMAL", "ARCHIVAL", "TAILORED"], basis: "founded in Paris in 1958 by French designer Jean Bousquet" },
  "Cactus Plant Flea Market": { country: "United States", city: "New York", founded: 2015, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], aka: ["cpfm"], basis: "founded in Brooklyn, New York in 2015 by Cynthia Lu" },
  "Calvin Klein": { country: "United States", city: "New York", founded: 1968, tags: ["MINIMAL", "SEDUCTIVE", "TAILORED"], basis: "founded in New York in 1968 by Calvin Klein and Barry Schwartz" },
  "Calvin Klein 205W39NYC": { country: "United States", city: "New York", parent: "Calvin Klein", founded: 2017, tags: ["AVANT-GARDE", "MINIMAL", "STATEMENT"], aka: ["205w39nyc", "calvin klein 205"], basis: "the runway/luxury line of Calvin Klein, New York (renamed 205W39NYC in 2017 under CCO Raf Simons; discontinued 2019)" },
  "Carhartt": { country: "United States", city: "Dearborn", founded: 1889, tags: ["UTILITARIAN", "STREETWEAR"], basis: "founded in Detroit in 1889 by Hamilton Carhartt; now based in Dearborn, Michigan" },
  "Carhartt WIP": { country: "Germany", foundedIn: "United States", tags: ["UTILITARIAN", "STREETWEAR", "GORP"], basis: "Work In Progress is the European arm, based at Weil am Rhein, of the American workwear company" },
  "Carol Christian Poell": { country: "Italy", city: "Milan", founded: 1995, tags: ["AVANT-GARDE", "ARCHIVAL", "INDEPENDENT"], aka: ["ccp"], basis: "founded in Milan in 1995; Poell is Austrian (born Linz), trained as a tailor in Vienna before Domus Academy" },
  "Casablanca": { country: "France", city: "Paris", founded: 2018, tags: ["STATEMENT", "TAILORED", "MINIMAL"], basis: "founded in Paris in 2018 by Charaf Tajer" },
  "Casey Casey": { country: "France", city: "Paris", founded: 2008, tags: ["MINIMAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Paris in 2008 by self-taught designer Gareth Casey, a former ceramicist and sculptor" },
  "Cav Empt": { country: "Japan", tags: ["STREETWEAR", "STATEMENT", "UTILITARIAN"], basis: "a Japanese label founded in 2011; co-founder Toby Feltwell is British" },
  "Cecilie Bahnsen": { country: "Denmark", city: "Copenhagen", founded: 2015, tags: ["SEDUCTIVE", "AVANT-GARDE", "MINIMAL"], basis: "founded in Copenhagen in 2015 by Cecilie Bahnsen" },
  "Celine": { country: "France", city: "Paris", tags: ["MINIMAL", "TAILORED", "SEDUCTIVE"], basis: "founded in Paris in 1945" },
  "Champion": { country: "United States", city: "New York", founded: 1919, tags: ["ARCHIVAL", "STREETWEAR", "UTILITARIAN"], basis: "founded in Rochester, New York in 1919 as Knickerbocker Knitting Mills by Simon Feinbloom and sons" },
  "Chanel": { country: "United Kingdom", foundedIn: "France", city: "London", founded: 1910, tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Paris in 1910; corporate headquarters relocated to London in 2018" },
  "Charles Jeffrey Loverboy": { country: "United Kingdom", city: "London", founded: 2015, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in London in 2015 by Scottish designer Charles Jeffrey" },
  "Chloé": { country: "France", foundedIn: "Egypt", city: "Paris", founded: 1952, tags: ["MINIMAL", "TAILORED", "ARCHIVAL"], basis: "founded in Paris in 1952 by Egyptian-born Gaby Aghion" },
  "Christian Lacroix": { country: "France", city: "Paris", founded: 1987, tags: ["STATEMENT", "ARCHIVAL", "SEDUCTIVE"], basis: "founded in Paris in 1987 by French designer Christian Lacroix (born in Arles)" },
  "Christopher Nemeth": { country: "Japan", foundedIn: "United Kingdom", city: "Tokyo", tags: ["ARCHIVAL", "STATEMENT", "INDEPENDENT"], basis: "British designer's brand, established in London in the 1980s; Nemeth relocated to Tokyo in 1986 and the brand has centered there since" },
  "Chrome Hearts": { country: "United States", city: "Los Angeles", tags: ["STATEMENT", "STREETWEAR"], basis: "founded in Los Angeles in 1988" },
  "Church's": { country: "United Kingdom", city: "Northampton", founded: 1873, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Northampton, England in 1873 by Thomas Church" },
  "Clarks": { country: "United Kingdom", city: "Street", founded: 1825, tags: ["ARCHIVAL", "UTILITARIAN", "TAILORED"], basis: "founded in Street, Somerset, England in 1825 by brothers Cyrus and James Clark" },
  "Claude Montana": { country: "France", city: "Paris", founded: 1979, tags: ["STATEMENT", "TAILORED", "ARCHIVAL"], basis: "founded in Paris in 1979 by French designer Claude Montana; the House of Montana went bankrupt in 1997" },
  "Cole Buxton": { country: "United Kingdom", city: "London", founded: 2014, tags: ["MINIMAL", "UTILITARIAN", "ARCHIVAL"], basis: "founded in London in 2014 by Cole Buxton and Jonny Wilson" },
  "Columbia Sportswear": { country: "United States", city: "Portland", founded: 1938, tags: ["GORP", "UTILITARIAN", "MINIMAL"], basis: "founded in Portland, Oregon in 1938 by Paul and Marie Lamfrom as a hat distributor" },
  "Comme des Garçons": { country: "Japan", city: "Tokyo", tags: ["AVANT-GARDE", "INDEPENDENT", "ARCHIVAL"], aka: ["comme des garcons"], basis: "founded in Tokyo in 1969 by Rei Kawakubo" },
  "Comme des Garçons Homme": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 1978, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "CDG's first menswear diffusion line, Tokyo, founded 1978; designed by Kawakubo until 2003, since led within the Junya Watanabe / CDG design studio" },
  "Comme des Garçons Homme Plus": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 1984, tags: ["AVANT-GARDE", "TAILORED", "STATEMENT"], aka: ["cdg homme plus", "homme plus"], basis: "the avant-garde menswear line of Comme des Garçons, launched in Tokyo in 1984" },
  "Comme des Garçons Play": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 2002, tags: ["STREETWEAR", "STATEMENT", "MINIMAL"], basis: "CDG's heart-logo casual line, logo designed by Polish artist Filip Pagowski, Tokyo, launched 2002" },
  "Comme des Garçons Shirt": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 1988, tags: ["STREETWEAR", "STATEMENT", "TAILORED"], basis: "CDG's shirting-focused menswear line, Tokyo, launched 1988" },
  "Comoli": { country: "Japan", city: "Tokyo", founded: 2011, tags: ["MINIMAL", "TAILORED", "ARCHIVAL"], basis: "founded in Tokyo in 2011 by Keijiro Komori, quiet Japanese-minimalist everyday clothing" },
  "Converse": { country: "United States", city: "Boston", founded: 1908, tags: ["ARCHIVAL", "STREETWEAR", "MINIMAL"], basis: "founded in Malden, Massachusetts in 1908 by Marquis Mills Converse" },
  "Coogi": { country: "United States", foundedIn: "Australia", city: "New York", founded: 1969, tags: ["ARCHIVAL", "STATEMENT", "STREETWEAR"], basis: "founded as Cuggi in Toorak, Australia in 1969 by Jacky Taranto; now operated out of New York" },
  "Corteiz": { country: "United Kingdom", city: "London", founded: 2017, tags: ["STREETWEAR", "INDEPENDENT", "STATEMENT"], basis: "founded in London in 2017 by Clint Ogbenna, known as Clint419" },
  "COS": { country: "United Kingdom", foundedIn: "Sweden", city: "London", founded: 2007, tags: ["MINIMAL", "TAILORED"], basis: "launched in London in 2007 as a line of Sweden's H&M Group" },
  "Cosmic Wonder": { country: "Japan", city: "Miyama", founded: 1997, tags: ["ARCHIVAL", "MINIMAL", "INDEPENDENT"], basis: "founded in 1997 by Japanese artist Yukinori Maeda; studio since 2016 in Miyama, a preserved historic village north of Kyoto" },
  "Costume National": { country: "Italy", city: "Milan", founded: 1986, tags: ["MINIMAL", "TAILORED", "INDEPENDENT"], basis: "founded in Milan in 1986 by Ennio Capasa (creative director) and brother Carlo Capasa (CEO)" },
  "Cottweiler": { country: "United Kingdom", city: "London", founded: 2010, tags: ["UTILITARIAN", "AVANT-GARDE", "MINIMAL"], basis: "founded in London in 2010 by Ben Cottrell and Matthew Dainty" },
  "Courrèges": { country: "France", city: "Paris", founded: 1961, tags: ["MINIMAL", "ARCHIVAL", "STATEMENT"], basis: "founded in Paris in 1961 by French designer André Courrèges, ex-Balenciaga, pioneer of Space Age style" },
  "Craig Green": { country: "United Kingdom", city: "London", tags: ["UTILITARIAN", "AVANT-GARDE", "MINIMAL"], basis: "founded in London in 2012" },
  "Damir Doma": { country: "Italy", foundedIn: "France", city: "Milan", founded: 2007, tags: ["AVANT-GARDE", "MINIMAL", "TAILORED"], basis: "launched in Paris in 2007; Doma is Croatian, moved the house's headquarters to Milan in 2015" },
  "Danner": { country: "United States", city: "Portland", founded: 1932, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Chippewa Falls, Wisconsin in 1932 by Charles Danner; moved to Portland, Oregon in 1936" },
  "Delvaux": { country: "Belgium", city: "Brussels", founded: 1829, tags: ["ARCHIVAL", "TAILORED", "STATEMENT"], basis: "founded in Brussels in 1829 by Charles Delvaux" },
  "Demobaza": { country: "Bulgaria", city: "Sofia", founded: 2007, tags: ["AVANT-GARDE", "UTILITARIAN", "STATEMENT"], basis: "founded in Sofia, Bulgaria in 2007 by Dimitar 'Demo' Sulev and Teodora 'Tono' Alexandrova" },
  "Denim Tears": { country: "United States", city: "New York", founded: 2019, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in 2019 by Tremaine Emory, exploring the African diaspora through denim" },
  "Devoa": { country: "Japan", city: "Tokyo", founded: 2006, tags: ["AVANT-GARDE", "TAILORED", "STATEMENT"], basis: "founded in Tokyo in 2006 by former professional wrestler Daisuke Nishida, anatomically-patterned 3D avant-garde menswear" },
  "Dickies": { country: "United States", city: "Costa Mesa", founded: 1922, tags: ["UTILITARIAN", "STREETWEAR"], basis: "founded in Fort Worth, Texas in 1922 by C.N. Williamson and E.E. \"Colonel\" Dickie" },
  "Diesel": { country: "Italy", city: "Breganze", founded: 1978, tags: ["STATEMENT", "STREETWEAR", "SEDUCTIVE"], basis: "founded in Molvena, Italy in 1978 by Renzo Rosso and Adriano Goldschmied; based in Breganze" },
  "Diet Butcher Slim Skin": { country: "Japan", city: "Tokyo", founded: 1997, tags: ["STREETWEAR", "AVANT-GARDE", "STATEMENT"], basis: "founded in Tokyo in 1997 by Hisashi Fukatami, punk-influenced (Clash/Sex Pistols) avant-garde streetwear merged with eccentric tailoring" },
  "Dior": { country: "France", city: "Paris", founded: 1946, tags: ["TAILORED", "SEDUCTIVE", "STATEMENT"], basis: "founded in Paris in 1946 by French designer Christian Dior, at 30 Avenue Montaigne" },
  "Dior Men": { country: "France", city: "Paris", tags: ["TAILORED", "STATEMENT", "ARCHIVAL"], basis: "the menswear line of the Paris house" },
  "Dirk Van Saene": { country: "Belgium", city: "Antwerp", founded: 1981, tags: ["AVANT-GARDE", "ARCHIVAL", "INDEPENDENT"], basis: "opened his own shop 'Beauties and Heroes' in Antwerp in 1981; Belgian member of the Antwerp Six" },
  "DKNY": { country: "United States", city: "New York", parent: "Donna Karan", founded: 1989, tags: ["STREETWEAR", "MINIMAL", "STATEMENT"], basis: "the diffusion line of Donna Karan, New York, launched 1989 as a more affordable collection" },
  "Dolce & Gabbana": { country: "Italy", city: "Milan", founded: 1985, tags: ["SEDUCTIVE", "STATEMENT", "TAILORED"], aka: ["dolce gabbana", "dolce and gabbana"], basis: "founded in Legnano, Italy in 1985 by Domenico Dolce and Stefano Gabbana; based in Milan" },
  "Donna Karan": { country: "United States", city: "New York", founded: 1984, tags: ["TAILORED", "MINIMAL", "SEDUCTIVE"], basis: "founded in New York in 1984 by Donna Karan with Stephan Weiss and Takihyo Corporation" },
  "Doublet": { country: "Japan", city: "Tokyo", founded: 2012, tags: ["STATEMENT", "STREETWEAR", "AVANT-GARDE"], basis: "founded in Tokyo in 2012 by Masayuki Ino, playful deconstructed streetwear; won the 2018 LVMH Prize" },
  "Dr. Martens": { country: "United Kingdom", foundedIn: "Germany", city: "London", founded: 1947, tags: ["INDEPENDENT", "STREETWEAR", "STATEMENT"], aka: ["dr martens", "doc martens", "docs"], basis: "boot designed in Seeshaupt, Germany in 1947 by Klaus Märtens and Herbert Funck; R. Griggs Group anglicized and built the UK brand from 1959" },
  "Dries Van Noten": { country: "Belgium", city: "Antwerp", tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "one of the Antwerp Six" },
  "Eckhaus Latta": { country: "United States", city: "Los Angeles", founded: 2011, tags: ["AVANT-GARDE", "INDEPENDENT", "MINIMAL"], basis: "founded in 2011 by RISD classmates Mike Eckhaus and Zoe Latta, now based in LA and NYC" },
  "Ecko Unltd.": { country: "United States", city: "New York", founded: 1993, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in New York City in 1993 by Marc Ecko" },
  "Ed Hardy": { country: "United States", city: "Los Angeles", founded: 2002, tags: ["STATEMENT", "ARCHIVAL", "STREETWEAR"], basis: "tattoo art of Don Ed Hardy licensed in 2004 by Christian Audigier, who built the global label from Los Angeles" },
  "Egonlab": { country: "France", city: "Paris", founded: 2018, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Paris in 2018 (as a couple and business partners) by French designers Florentin Glémarec and Kévin Nompeix" },
  "Elena Dawson": { country: "United Kingdom", founded: 2006, tags: ["ARCHIVAL", "TAILORED", "INDEPENDENT"], basis: "founded in 2006 after co-founding Paul Harnden Clothiers in 2000; works from a studio in East Sussex, England" },
  "Ellesse": { country: "United Kingdom", foundedIn: "Italy", city: "London", founded: 1959, tags: ["ARCHIVAL", "STREETWEAR", "STATEMENT"], basis: "founded in Perugia, Italy in 1959 by Leonardo \"Mantis\" Servadio" },
  "Emilio Pucci": { country: "Italy", city: "Florence", founded: 1947, tags: ["STATEMENT", "ARCHIVAL", "SEDUCTIVE"], basis: "founded in Florence in 1947 by Emilio Pucci" },
  "Emporio Armani": { country: "Italy", city: "Milan", parent: "Giorgio Armani", founded: 1981, tags: ["TAILORED", "MINIMAL", "STATEMENT"], basis: "the diffusion line of Giorgio Armani, Milan, launched in 1981" },
  "Enfants Riches Déprimés": { country: "United States", city: "Los Angeles", founded: 2012, tags: ["INDEPENDENT", "STATEMENT", "AVANT-GARDE"], aka: ["enfants riches deprimes", "erd"], basis: "founded in Los Angeles in 2012 by artist-designer Henri Alexander Levy; flagships also in Paris and Seoul" },
  "Engineered Garments": { country: "United States", city: "New York", founded: 1999, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], aka: ["engineered garments"], basis: "a Nepenthes label designed by Daiki Suzuki in New York since 1999; the parent company Nepenthes is based in Tokyo, Japan" },
  "Enyce": { country: "United States", city: "New York", founded: 1996, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in New York City in 1996 by Evan Davis, Lando Felix and Tony Shellman" },
  "ERL": { country: "United States", city: "Venice", tags: ["STREETWEAR", "AVANT-GARDE", "INDEPENDENT"], basis: "founded in Venice, California" },
  "Etro": { country: "Italy", city: "Milan", founded: 1968, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Milan in 1968 by Gerolamo \"Gimmo\" Etro" },
  "Evisu": { country: "Japan", city: "Osaka", founded: 1991, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in Osaka in 1991 by Hidehiko Yamane, hand-painted seagull-logo selvedge denim" },
  "Eytys": { country: "Sweden", city: "Stockholm", founded: 2013, tags: ["STREETWEAR", "MINIMAL", "INDEPENDENT"], basis: "founded in Stockholm in 2013 by Max Schiller and Jonathan Hirschfeld as a unisex footwear label" },
  "Facetasm": { country: "Japan", city: "Tokyo", founded: 2007, tags: ["AVANT-GARDE", "STATEMENT", "STREETWEAR"], basis: "founded in Tokyo in 2007 by Hiromichi Ochiai, a Bunka Fashion College graduate; deconstructed layering" },
  "Fear of God": { country: "United States", city: "Los Angeles", tags: ["MINIMAL", "STREETWEAR", "TAILORED"], basis: "founded in Los Angeles in 2013" },
  "Fear of God Essentials": { country: "United States", city: "Los Angeles", parent: "Fear of God", founded: 2018, tags: ["MINIMAL", "STREETWEAR"], aka: ["essentials"], basis: "the competitively priced sister line of Fear of God, Los Angeles, launched in 2018" },
  "Fendi": { country: "Italy", city: "Rome", tags: ["ARCHIVAL", "TAILORED", "STATEMENT"], basis: "founded in Rome in 1925" },
  "Feng Chen Wang": { country: "United Kingdom", city: "London", founded: 2015, tags: ["AVANT-GARDE", "STATEMENT", "STREETWEAR"], basis: "founded in London in 2015 by Chinese designer Feng Chen Wang" },
  "Ferragamo": { country: "Italy", city: "Florence", tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Florence in 1927" },
  "Fila": { country: "South Korea", foundedIn: "Italy", city: "Seoul", founded: 1911, tags: ["ARCHIVAL", "STREETWEAR", "STATEMENT"], basis: "founded in Coggiola, Italy in 1911 by brothers Ettore and Giansevero Fila" },
  "Filippa K": { country: "Sweden", city: "Stockholm", founded: 1993, tags: ["MINIMAL", "TAILORED", "INDEPENDENT"], basis: "founded in Stockholm in 1993 by Filippa Knutsson, Patrik Kihlborg and Karin Hellners" },
  "Filson": { country: "United States", city: "Seattle", founded: 1897, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Seattle in 1897 by Clinton C. Filson" },
  "Fjällräven": { country: "Sweden", city: "Örnsköldsvik", founded: 1960, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Örnsköldsvik, Sweden in 1960 by Åke Nordin" },
  "Forme d'Expression": { country: "Italy", foundedIn: "South Korea", city: "Perugia", founded: 2005, tags: ["TAILORED", "MINIMAL", "INDEPENDENT"], basis: "founded in Perugia, Italy in 2005 by Seoul-born designer Koeun Park, ex-Giorgio Armani and Donna Karan" },
  "Fragment Design": { country: "Japan", city: "Tokyo", founded: 2003, tags: ["MINIMAL", "STREETWEAR", "INDEPENDENT"], basis: "founded in Tokyo in 2003 by Hiroshi Fujiwara, collaboration-driven minimalist streetwear" },
  "Fred Perry": { country: "United Kingdom", city: "London", founded: 1952, tags: ["ARCHIVAL", "TAILORED", "STREETWEAR"], basis: "founded in London in 1952 by tennis champion Fred Perry with Tibby Wegner" },
  "FUBU": { country: "United States", city: "New York", founded: 1992, tags: ["STREETWEAR", "STATEMENT", "ARCHIVAL"], basis: "founded in New York City in 1992 by Daymond John, J. Alexander Martin, Keith Perrin and Carlton Brown" },
  "Fucking Awesome": { country: "United States", city: "Los Angeles", founded: 2014, tags: ["INDEPENDENT", "STREETWEAR", "STATEMENT"], basis: "founded by skateboarders Jason Dill and Anthony Van Engelen in 2014" },
  "Full Count": { country: "Japan", city: "Osaka", founded: 1992, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Osaka in 1992 by Mikiharu Tsujita, part of the Osaka Five, known for Zimbabwe-cotton selvedge denim" },
  "Gallery Dept.": { country: "United States", city: "Los Angeles", founded: 2017, tags: ["STREETWEAR", "INDEPENDENT", "ARCHIVAL"], basis: "founded in Los Angeles in 2017 by artist Josué Thomas" },
  "Ganni": { country: "Denmark", city: "Copenhagen", founded: 2000, tags: ["STATEMENT", "INDEPENDENT"], basis: "founded in Copenhagen in 2000 by Frans Truelsen as a cashmere label; relaunched under Nicolaj and Ditte Reffstrup in 2009" },
  "Ganryu": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 2007, tags: ["STREETWEAR", "MINIMAL", "UTILITARIAN"], basis: "unisex streetwear line under Comme des Garçons, Tokyo, launched 2007; designer Fumito Ganryu was a former Junya Watanabe patternmaker" },
  "Gap": { country: "United States", city: "San Francisco", founded: 1969, tags: ["MINIMAL", "UTILITARIAN", "ARCHIVAL"], kb: false, basis: "founded in San Francisco in 1969 by Donald and Doris Fisher" },
  "Gareth Pugh": { country: "United Kingdom", city: "London", founded: 2005, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "English designer based in London; rose to prominence at Fashion East's 2005 show, solo Fashion Week debut in 2006" },
  "Gentle Monster": { country: "South Korea", city: "Seoul", founded: 2011, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Seoul in 2011 by Hankook Kim" },
  "Geoffrey B. Small": { country: "Italy", founded: 1993, tags: ["TAILORED", "ARCHIVAL", "INDEPENDENT"], basis: "founded in 1993 by American designer Geoffrey B. Small, hand-made in Carvazere, Veneto, Italy; shown in Paris since inception" },
  "Gianfranco Ferré": { country: "Italy", city: "Milan", founded: 1978, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Milan in 1978 by Gianfranco Ferré; he was also stylistic director of Dior 1989–1997" },
  "Giorgio Armani": { country: "Italy", city: "Milan", founded: 1975, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], aka: ["armani"], basis: "founded in Milan in 1975 by Giorgio Armani and Sergio Galeotti" },
  "Givenchy": { country: "France", city: "Paris", founded: 1952, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Paris in 1952 by French designer Hubert de Givenchy" },
  "GmbH": { country: "Germany", city: "Berlin", founded: 2016, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], kb: false, basis: "founded in Berlin in 2016 by Benjamin Alexander Huseby (Norwegian-Pakistani) and Serhat Isik (German-Turkish)" },
  "Goodenough": { country: "Japan", city: "Tokyo", founded: 1990, tags: ["STREETWEAR", "INDEPENDENT", "STATEMENT"], basis: "founded in Tokyo (Harajuku) around 1990 by Hiroshi Fujiwara, pioneering Ura-Harajuku graphic tee label" },
  "Gucci": { country: "Italy", city: "Florence", tags: ["STATEMENT", "SEDUCTIVE"], basis: "founded in Florence in 1921" },
  "Guidi": { country: "Italy", city: "Pescia", founded: 1896, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], basis: "tannery founded in Pescia, Tuscany in 1896; began producing its own footwear line in 2004" },
  "Haglöfs": { country: "Sweden", city: "Stockholm", founded: 1914, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Dalarna, Sweden in 1914 by Wiktor Haglöf" },
  "Haider Ackermann": { country: "France", city: "Paris", founded: 2001, tags: ["AVANT-GARDE", "TAILORED", "SEDUCTIVE"], basis: "founded in Paris in 2001; Ackermann is Colombian-born, raised in a French Alsatian family" },
  "Han Kjøbenhavn": { country: "Denmark", city: "Copenhagen", founded: 2008, tags: ["STREETWEAR", "MINIMAL", "INDEPENDENT"], basis: "founded in Copenhagen in 2008 by Jannik Wikkelsø Davidsen" },
  "Helmut Lang": { country: "United States", foundedIn: "Austria", city: "New York", tags: ["MINIMAL", "ARCHIVAL", "TAILORED"], basis: "founded in Vienna in 1986, a New York label since 1997" },
  "Henrik Vibskov": { country: "Denmark", city: "Copenhagen", founded: 2001, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Copenhagen in 2001 by Henrik Vibskov" },
  "Hermès": { country: "France", city: "Paris", founded: 1837, tags: ["MINIMAL", "TAILORED", "ARCHIVAL"], basis: "founded in Paris in 1837 by Thierry Hermès (French father, German mother, born in Krefeld)" },
  "Hockey": { country: "United States", city: "Los Angeles", parent: "Fucking Awesome", founded: 2015, tags: ["INDEPENDENT", "STREETWEAR", "STATEMENT"], kb: false, basis: "launched in 2015 by Jason Dill and Anthony Van Engelen as a sister skate brand to Fucking Awesome" },
  "Hoka": { country: "United States", foundedIn: "France", city: "Goleta", founded: 2009, tags: ["GORP", "STREETWEAR"], basis: "founded in Annecy, France in 2009 by Nicolas Mermoud and Jean-Luc Diard" },
  "Homme Plissé Issey Miyake": { country: "Japan", city: "Tokyo", parent: "Issey Miyake", founded: 2013, tags: ["MINIMAL", "UTILITARIAN", "ARCHIVAL"], basis: "menswear pleating line of Issey Miyake, launched 2013, Tokyo" },
  "Hood By Air": { country: "United States", city: "New York", founded: 2006, tags: ["AVANT-GARDE", "STATEMENT", "STREETWEAR"], aka: ["hba"], basis: "founded in New York City in 2006 by Shayne Oliver and Raul Lopez" },
  "Hope": { country: "Sweden", city: "Stockholm", founded: 2001, tags: ["MINIMAL", "UTILITARIAN", "INDEPENDENT"], kb: false, basis: "founded in Stockholm in 2001 by Ann Ringstrand and Stefan Söderberg" },
  "Houdini Sportswear": { country: "Sweden", city: "Stockholm", founded: 1993, tags: ["GORP", "UTILITARIAN", "MINIMAL"], basis: "founded in Stockholm in 1993 by climber and ski instructor Lotta Giornofelice" },
  "Hugo Boss": { country: "Germany", city: "Metzingen", founded: 1924, tags: ["TAILORED", "STATEMENT", "MINIMAL"], basis: "founded in Metzingen in 1924 by Hugo Ferdinand Boss" },
  "Hussein Chalayan": { country: "United Kingdom", foundedIn: "Cyprus", city: "London", founded: 1994, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in London in 1994; Chalayan is British-Cypriot, born in Nicosia, moved to England in 1978" },
  "Hyein Seo": { country: "South Korea", city: "Seoul", founded: 2014, tags: ["STATEMENT", "STREETWEAR", "AVANT-GARDE"], basis: "founded in 2014 by Hyein Seo and Jinho Lee after training in Antwerp; settled permanently in Seoul in 2018" },
  "Hyke": { country: "Japan", city: "Tokyo", founded: 2013, tags: ["UTILITARIAN", "MINIMAL", "TAILORED"], basis: "founded in Tokyo in 2013 by married designers Hideaki Yoshihara and Yukiko Ode, refined military and utility basics" },
  "Hysteric Glamour": { country: "Japan", city: "Tokyo", founded: 1984, tags: ["STATEMENT", "STREETWEAR", "ARCHIVAL"], basis: "founded in Tokyo in 1984 by Nobuhiko Kitamura, rock-and-roll and pinup-graphic streetwear" },
  "Iceberg": { country: "Italy", city: "San Giovanni in Marignano", founded: 1974, tags: ["STATEMENT", "STREETWEAR", "ARCHIVAL"], basis: "founded in 1974 by Silvano Gerani and Giuliana Marchini; part of the Gilmar Group" },
  "If Six Was Nine": { country: "Japan", city: "Tokyo", founded: 1997, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], aka: ["ifsixwasnine"], basis: "founded in Tokyo in 1997 by Nobuhiko Sato, distressed rebellious rock fashion named after the Hendrix song; sister label to L.G.B." },
  "Incarnation": { country: "Italy", city: "Perugia", founded: 2009, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], kb: false, basis: "founded in Italy in 2009 by Japanese leatherworker Keita Ogawa, formerly of Backlash, initially in Florence" },
  "Iron Heart": { country: "Japan", city: "Tokyo", founded: 2002, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Japan in 2002 by Shinichi Haraki (Works Inc.), heavyweight motorcycle-focused selvedge denim" },
  "Isaac Sellam": { country: "France", city: "Paris", founded: 2002, tags: ["AVANT-GARDE", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Paris in 2002 by French designer Isaac Sellam as a leather-research atelier" },
  "Isabel Marant": { country: "France", city: "Paris", founded: 1994, tags: ["MINIMAL", "TAILORED", "INDEPENDENT"], basis: "founded in Paris in 1994 by French designer Isabel Marant" },
  "Issey Miyake": { country: "Japan", city: "Tokyo", founded: 1970, tags: ["AVANT-GARDE", "MINIMAL", "ARCHIVAL"], basis: "founded in Tokyo in 1970 by Issey Miyake, known for pleating and technical-textile innovation" },
  "Jacquemus": { country: "France", city: "Paris", founded: 2009, tags: ["SEDUCTIVE", "MINIMAL", "STATEMENT"], basis: "founded in Paris in 2009 by French designer Simon Porte Jacquemus, aged 20" },
  "Japan Blue Jeans": { country: "Japan", city: "Kojima", founded: 2010, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Kojima, Okayama in 2010 by Hiroki Kishimoto's Collect mill — Japan's denim district" },
  "Jean Colonna": { country: "France", foundedIn: "Algeria", city: "Paris", founded: 1987, tags: ["STATEMENT", "INDEPENDENT", "SEDUCTIVE"], basis: "founded in Paris in 1987; Colonna was born in Oran, Algeria, and is a French citizen, nicknamed 'the king of Paris downtown chic'" },
  "Jean Paul Gaultier": { country: "France", city: "Paris", founded: 1982, tags: ["AVANT-GARDE", "SEDUCTIVE", "ARCHIVAL"], aka: ["gaultier"], basis: "founded in Paris in 1982 by French designer Jean Paul Gaultier" },
  "Jil Sander": { country: "Italy", foundedIn: "Germany", city: "Milan", tags: ["MINIMAL", "TAILORED"], basis: "founded in Hamburg in 1968, run from Milan today" },
  "John Galliano": { country: "France", foundedIn: "United Kingdom", city: "Paris", founded: 1985, tags: ["STATEMENT", "ARCHIVAL", "SEDUCTIVE"], basis: "British designer, founded his own house in London in the mid-1980s, relocated to Paris in 1989; label went defunct in 2011" },
  "John Smedley": { country: "United Kingdom", founded: 1784, tags: ["ARCHIVAL", "MINIMAL", "TAILORED"], basis: "founded at Lea Mills, Derbyshire, England in 1784 by Peter Nightingale and John Smedley the elder" },
  "Julius": { country: "Japan", city: "Tokyo", founded: 2001, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in Tokyo in 2001 as an art/film project by Tatsuro Horikawa, expanded into black-and-grey monochrome avant-garde menswear by 2004" },
  "Junya Watanabe": { country: "Japan", city: "Tokyo", tags: ["AVANT-GARDE", "UTILITARIAN", "ARCHIVAL"], basis: "a Comme des Garçons line, Tokyo" },
  "Junya Watanabe MAN": { country: "Japan", city: "Tokyo", parent: "Junya Watanabe", founded: 2000, tags: ["AVANT-GARDE", "TAILORED", "STATEMENT"], basis: "the menswear collection of Junya Watanabe, debuted 2000, shown in Paris, designed from Tokyo" },
  "Juun.J": { country: "South Korea", city: "Seoul", founded: 2007, tags: ["TAILORED", "AVANT-GARDE", "ARCHIVAL"], basis: "founded in Seoul in 2007 by Jung Wook-jun, evolving from his 1999 label Lone Costume" },
  "JW Anderson": { country: "United Kingdom", city: "London", tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in London in 2008" },
  "Kapital": { country: "Japan", city: "Kojima", tags: ["INDEPENDENT", "ARCHIVAL", "GORP"], basis: "founded in Kojima, Okayama — Japan's denim district" },
  "Kappa": { country: "Italy", city: "Turin", founded: 1978, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in Turin, Italy in 1978 by Marco Boglione, growing out of the 1916 Maglificio Calzificio Torinese hosiery firm" },
  "Kaptain Sunshine": { country: "Japan", city: "Tokyo", tags: ["ARCHIVAL", "UTILITARIAN", "TAILORED"], basis: "founded in Tokyo in 2013" },
  "Karl Kani": { country: "United States", city: "Los Angeles", founded: 1989, tags: ["STREETWEAR", "STATEMENT", "ARCHIVAL"], basis: "founded in Los Angeles in 1989 by Carl Williams, known professionally as Karl Kani" },
  "Keen": { country: "United States", city: "Portland", founded: 2003, tags: ["GORP", "UTILITARIAN", "MINIMAL"], kb: false, basis: "founded in Alameda, California in 2003 by Martin Keen and Rory Fuerst; HQ moved to Portland, Oregon in 2006" },
  "Kenzo": { country: "France", city: "Paris", founded: 1970, tags: ["STATEMENT", "STREETWEAR", "ARCHIVAL"], basis: "founded in Paris in 1970 by Kenzo Takada; the designer is Japanese" },
  "Khaite": { country: "United States", city: "New York", tags: ["MINIMAL", "TAILORED", "SEDUCTIVE"], basis: "founded in New York in 2016" },
  "Kiko Kostadinov": { country: "United Kingdom", city: "London", tags: ["AVANT-GARDE", "UTILITARIAN", "INDEPENDENT"], basis: "founded in London in 2016; the designer is Bulgarian" },
  "Kith": { country: "United States", city: "New York", founded: 2011, tags: ["STREETWEAR", "MINIMAL"], basis: "founded in New York City in 2011 by Ronnie Fieg" },
  "Klättermusen": { country: "Sweden", city: "Umeå", founded: 1975, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded by a group of local climbers in Umeå, Sweden in 1975" },
  "Kmrii": { country: "Indonesia", founded: 2000, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in Japan in 2000 by Lui Onozaki; avant-garde leather label blending tribal and industrial influences" },
  "Kolor": { country: "Japan", city: "Tokyo", founded: 2004, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Tokyo in 2004 by Junichi Abe (ex-Comme des Garçons/Junya Watanabe), fabric-mixing and color-blocked tailoring" },
  "Kris Van Assche": { country: "France", foundedIn: "Belgium", city: "Paris", founded: 2005, tags: ["MINIMAL", "TAILORED", "INDEPENDENT"], basis: "own label founded 2005; Van Assche is Belgian, moved to Paris in 1998, later creative director of Dior Homme and Berluti" },
  "L.G.B.": { country: "Japan", city: "Tokyo", founded: 1999, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], aka: ["lgb", "le grand bleu"], basis: "founded in Harajuku, Tokyo in 1999 by Nobuhiko Sato, rockstar-aesthetic handmade denim under Maniac Corporation" },
  "Label Under Construction": { country: "Italy", city: "Perugia", founded: 2003, tags: ["AVANT-GARDE", "TAILORED", "INDEPENDENT"], basis: "founded in Perugia in 2003 by Luca Laurini as an experimental knitwear study" },
  "Labrum London": { country: "United Kingdom", city: "London", founded: 2014, tags: ["TAILORED", "ARCHIVAL", "INDEPENDENT"], basis: "founded in London in 2014 by Foday Dumbuya, of Sierra Leonean/Cypriot/British background" },
  "Lacoste": { country: "France", city: "Paris", founded: 1933, tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Paris in 1933 by tennis player René Lacoste and André Gillier" },
  "Lanvin": { country: "France", city: "Paris", founded: 1889, tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Paris in 1889 by French designer Jeanne Lanvin, the oldest French fashion house still operating" },
  "Lee": { country: "United States", city: "Greensboro", founded: 1889, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], kb: false, basis: "founded in Salina, Kansas in 1889 by Henry David Lee" },
  "Lemaire": { country: "France", city: "Paris", tags: ["MINIMAL", "TAILORED", "UTILITARIAN"], basis: "founded in Paris in 1991" },
  "Levi's": { country: "United States", city: "San Francisco", founded: 1853, tags: ["ARCHIVAL", "UTILITARIAN", "STREETWEAR"], aka: ["levis"], basis: "founded in San Francisco in 1853 by Levi Strauss" },
  "Levi's Vintage Clothing": { country: "United States", city: "San Francisco", parent: "Levi's", tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], aka: ["lvc"], basis: "Levi Strauss & Co.'s archival reproduction line of historic denim, San Francisco" },
  "Loewe": { country: "Spain", city: "Madrid", tags: ["AVANT-GARDE", "TAILORED", "STATEMENT"], basis: "founded in Madrid in 1846" },
  "Loro Piana": { country: "Italy", city: "Milan", founded: 1924, tags: ["TAILORED", "MINIMAL"], basis: "founded in Quarona, Italy in 1924 by Pietro Loro Piana; based in Milan" },
  "Louis Vuitton": { country: "France", city: "Paris", tags: ["ARCHIVAL", "STATEMENT", "TAILORED"], basis: "founded in Paris in 1854" },
  "Luar": { country: "United States", city: "New York", founded: 2011, tags: ["STATEMENT", "INDEPENDENT", "ARCHIVAL"], basis: "founded in New York City in 2011 by Raul Lopez, former co-founder of Hood By Air" },
  "Ludovic de Saint Sernin": { country: "France", city: "Paris", founded: 2017, tags: ["SEDUCTIVE", "MINIMAL", "INDEPENDENT"], basis: "founded in Paris in 2017 by designer Ludovic de Saint Sernin, born in Brussels, raised in Ivory Coast, based in Paris since age 7" },
  "Lyle & Scott": { country: "United Kingdom", foundedIn: "Scotland", city: "London", founded: 1874, tags: ["ARCHIVAL", "TAILORED", "MINIMAL"], basis: "founded in Hawick, Scotland in 1874 by William Lyle and Walter Scott" },
  "m.a+": { country: "Italy", city: "Rome", founded: 2006, tags: ["AVANT-GARDE", "UTILITARIAN", "INDEPENDENT"], aka: ["ma+", "ma plus", "maurizio amadei"], basis: "founded in 2006 by Rome-born Maurizio Amadei, formerly of Carpe Diem; artisanal workshop outside Rome" },
  "Maison Margiela": { country: "France", city: "Paris", tags: ["AVANT-GARDE", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Paris in 1988; Martin Margiela is Belgian and of the Antwerp Six" },
  "Mame Kurogouchi": { country: "Japan", city: "Tokyo", founded: 2010, tags: ["ARCHIVAL", "TAILORED", "MINIMAL"], basis: "founded in Tokyo in 2010 by Maiko Kurogouchi, craft-driven womenswear inspired by Japanese vintage clothing, painting and ceramics" },
  "Mammut": { country: "Switzerland", city: "Seon", founded: 1862, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Dintikon, Switzerland in 1862 by Kaspar Tanner as a ropery" },
  "Marc Jacobs": { country: "United States", city: "New York", founded: 1986, tags: ["ARCHIVAL", "STATEMENT", "INDEPENDENT"], basis: "founded in New York in 1986 by Marc Jacobs" },
  "Margaret Howell": { country: "United Kingdom", city: "London", founded: 1972, tags: ["MINIMAL", "TAILORED", "ARCHIVAL"], basis: "founded in Blackheath, London in 1972 by Margaret Howell" },
  "Marimekko": { country: "Finland", city: "Helsinki", founded: 1951, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Helsinki in 1951 by Viljo and Armi Ratia together with designer Riitta Immonen" },
  "Marina Yee": { country: "Belgium", city: "Antwerp", founded: 2018, tags: ["AVANT-GARDE", "INDEPENDENT", "ARCHIVAL"], basis: "Belgian member of the Antwerp Six; relaunched her own label (M.Y. Project / Marina Yee) in Antwerp in 2018 after a decade away from fashion" },
  "Marine Serre": { country: "France", city: "Paris", tags: ["UTILITARIAN", "STATEMENT", "ARCHIVAL"], basis: "founded in Paris in 2017" },
  "Marni": { country: "Italy", city: "Milan", founded: 1994, tags: ["STATEMENT", "INDEPENDENT", "AVANT-GARDE"], basis: "founded in Milan in 1994 by Consuelo Castiglioni, a Swiss designer" },
  "Martin Margiela": { country: "France", city: "Paris", tags: ["AVANT-GARDE", "ARCHIVAL", "INDEPENDENT"], basis: "the Belgian designer's own name, distinct from Maison Margiela, the fashion house he founded in 1988 and left in December 2009; he has since worked as a visual artist" },
  "Martine Rose": { country: "United Kingdom", city: "London", tags: ["STREETWEAR", "INDEPENDENT", "AVANT-GARDE"], basis: "founded in London in 2007" },
  "Massimo Dutti": { country: "Spain", city: "Barcelona", founded: 1985, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "founded in Spain in 1985 by Armando Lasauca; acquired by Inditex in 1991" },
  "Massimo Osti Studio": { country: "Italy", city: "Bologna", founded: 2023, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "tribute brand honoring designer Massimo Osti, launched September 2023 in Bologna, Italy, design led by Leonardo Fasolo" },
  "McQ": { country: "United Kingdom", city: "London", parent: "Alexander McQueen", founded: 2007, tags: ["STREETWEAR", "STATEMENT", "TAILORED"], basis: "lower-priced diffusion line of Alexander McQueen launched 2007 in London" },
  "Merrell": { country: "United States", city: "Rockford", founded: 1981, tags: ["GORP", "UTILITARIAN", "MINIMAL"], basis: "founded in 1981 by Randy Merrell and Clark Matis" },
  "Mihara Yasuhiro": { country: "Japan", city: "Tokyo", founded: 1999, tags: ["AVANT-GARDE", "ARCHIVAL", "STATEMENT"], basis: "founded in Tokyo in 1999 by Yasuhiro Mihara as SOSU Mihara Yasuhiro, footwear-led dark experimental tailoring" },
  "Missoni": { country: "Italy", city: "Varese", founded: 1953, tags: ["ARCHIVAL", "STATEMENT", "INDEPENDENT"], basis: "founded in Gallarate, Italy in 1953 by Ottavio and Rosita Missoni; based in Varese" },
  "Miu Miu": { country: "Italy", city: "Milan", tags: ["STATEMENT", "SEDUCTIVE", "INDEPENDENT"], basis: "the Prada sister line, Milan" },
  "Molly Goddard": { country: "United Kingdom", city: "London", founded: 2015, tags: ["STATEMENT", "AVANT-GARDE", "SEDUCTIVE"], basis: "founded in London in 2015 by British designer Molly Goddard" },
  "Momotaro Jeans": { country: "Japan", city: "Kojima", founded: 2005, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "launched in Kojima, Okayama in 2005 by Japan Blue's Hisao Manabe — Japan's denim district" },
  "Moschino": { country: "Italy", city: "Milan", founded: 1983, tags: ["STATEMENT", "AVANT-GARDE", "ARCHIVAL"], basis: "founded in Milan in 1983 by Franco Moschino" },
  "Mowalola": { country: "United Kingdom", foundedIn: "Nigeria", city: "London", founded: 2017, tags: ["AVANT-GARDE", "SEDUCTIVE", "STATEMENT"], basis: "launched by Nigerian-born, London-based designer Mowalola Ogunlesi, debuting 2017, London Fashion Week 2019" },
  "Mugler": { country: "France", city: "Paris", founded: 1978, tags: ["SEDUCTIVE", "AVANT-GARDE", "STATEMENT"], basis: "founded in Paris in 1978 by French designer Thierry Mugler" },
  "Muji": { country: "Japan", city: "Tokyo", founded: 1980, tags: ["MINIMAL", "UTILITARIAN", "ARCHIVAL"], basis: "launched in Japan in 1980 as a no-brand product line of the Seiyu supermarket chain" },
  "Namacheko": { country: "Belgium", city: "Antwerp", founded: 2017, tags: ["ARCHIVAL", "TAILORED", "INDEPENDENT"], basis: "founded in January 2017 by Kurdish-Belgian siblings Dilan and Lezan Lurr, based in Antwerp" },
  "Napapijri": { country: "Switzerland", foundedIn: "Italy", city: "Stabio", founded: 1987, tags: ["UTILITARIAN", "MINIMAL", "ARCHIVAL"], basis: "founded in Aosta, Italy in 1987 by Giuliana Rosset" },
  "Nautica": { country: "United States", city: "New York", founded: 1983, tags: ["UTILITARIAN", "ARCHIVAL", "STATEMENT"], basis: "founded in New York in 1983 by David Chu" },
  "Needles": { country: "Japan", city: "Tokyo", tags: ["ARCHIVAL", "STREETWEAR", "UTILITARIAN"], basis: "a Nepenthes line, Tokyo" },
  "Neighborhood": { country: "Japan", city: "Tokyo", founded: 1994, tags: ["STREETWEAR", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Harajuku, Tokyo in 1994 by Shinsuke Takizawa, motorcycle-subculture and vintage-workwear streetwear" },
  "Nepenthes": { country: "Japan", city: "Tokyo", founded: 1988, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Aoyama, Tokyo in 1988 by Keizo Shimizu; parent company of Engineered Garments, Needles and South2 West8" },
  "New Balance": { country: "United States", city: "Boston", founded: 1906, tags: ["STREETWEAR", "GORP", "MINIMAL"], basis: "founded in Boston, Massachusetts in 1906 by William J. Riley" },
  "Nicholas Daley": { country: "United Kingdom", city: "London", founded: 2015, tags: ["ARCHIVAL", "TAILORED", "INDEPENDENT"], basis: "founded in London in 2015 by designer Nicholas Daley, of Jamaican and Scottish heritage" },
  "Nigel Cabourn": { country: "United Kingdom", founded: 1970, tags: ["ARCHIVAL", "UTILITARIAN", "MINIMAL"], basis: "founded in North East England in the 1970s by Nigel Cabourn" },
  "Nike": { country: "United States", city: "Beaverton", founded: 1964, tags: ["STREETWEAR", "UTILITARIAN"], basis: "founded in Eugene, Oregon in 1964 by Bill Bowerman and Phil Knight as Blue Ribbon Sports" },
  "Nike ACG": { country: "United States", city: "Beaverton", tags: ["UTILITARIAN", "GORP", "MINIMAL"], aka: ["acg"], basis: "the All Conditions Gear line of the Oregon company" },
  "Nina Ricci": { country: "France", city: "Paris", founded: 1932, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Paris in 1932 by Nina Ricci and her son Robert Ricci" },
  "Noah": { country: "United States", city: "New York", founded: 2015, tags: ["STREETWEAR", "TAILORED", "INDEPENDENT"], basis: "founded in New York City in 2015 by Brendon Babenzien (and Estelle Bailey-Babenzien)" },
  "Nonnative": { country: "Japan", city: "Tokyo", founded: 1999, tags: ["UTILITARIAN", "MINIMAL", "STREETWEAR"], basis: "founded in Tokyo in 1999 by Satoshi Saffen during the Urahara movement, workwear-influenced menswear" },
  "Norrøna": { country: "Norway", city: "Lysaker", founded: 1929, tags: ["GORP", "UTILITARIAN", "ARCHIVAL"], basis: "founded in Norway in 1929 by Jørgen Jørgensen" },
  "Norse Projects": { country: "Denmark", city: "Copenhagen", founded: 2004, tags: ["MINIMAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Copenhagen in 2004 by Tobia Sloth, Anton Juul and Mikkel Grønnebæk as a retail shop and art gallery" },
  "Number (N)ine": { country: "Japan", city: "Tokyo", founded: 1996, tags: ["ARCHIVAL", "INDEPENDENT", "AVANT-GARDE"], aka: ["number nine", "numbernine"], basis: "founded in Tokyo in 1996 by Takahiro Miyashita, rock/gothic/cowboy-influenced menswear" },
  "Off-White": { country: "Italy", city: "Milan", tags: ["STREETWEAR", "STATEMENT", "AVANT-GARDE"], aka: ["off white"], basis: "founded in Milan in 2012; Virgil Abloh was American" },
  "Oliver Spencer": { country: "United Kingdom", city: "London", founded: 2002, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "founded in London in 2002 by Oliver Spencer, after his earlier label Favourbrook" },
  "Online Ceramics": { country: "United States", city: "Los Angeles", founded: 2016, tags: ["INDEPENDENT", "STREETWEAR", "STATEMENT"], basis: "founded in Los Angeles in 2016 by Alix Ross and Elijah Funk" },
  "Only NY": { country: "United States", city: "New York", founded: 2007, tags: ["INDEPENDENT", "STREETWEAR", "ARCHIVAL"], basis: "founded in New York City in 2007 by Micah Belamarich and Julian Goldstein" },
  "Orslow": { country: "Japan", city: "Kurashiki", founded: 2005, tags: ["UTILITARIAN", "ARCHIVAL", "MINIMAL"], basis: "founded in 2005 by Ichiro Nakatsu, vintage-reproduction denim made in Kurashiki, Okayama — Japan's denim district" },
  "Ottolinger": { country: "Germany", city: "Berlin", founded: 2016, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Berlin in 2016 by Swiss-born designers Christa Bösch and Cosima Gadient" },
  "Our Legacy": { country: "Sweden", city: "Stockholm", tags: ["INDEPENDENT", "MINIMAL", "ARCHIVAL"], basis: "founded in Stockholm in 2005" },
  "Palace": { country: "United Kingdom", city: "London", founded: 2009, tags: ["STREETWEAR", "INDEPENDENT"], basis: "founded in London in 2009 by Lev Tanju, Gareth Skewis and Marshall Taylor" },
  "Paloma Wool": { country: "Spain", city: "Barcelona", founded: 2014, tags: ["STATEMENT", "AVANT-GARDE", "INDEPENDENT"], basis: "founded in Barcelona in 2014 by Paloma Lanna and Tana Latorre" },
  "Paraboot": { country: "France", city: "Saint-Jean-de-Moirans", founded: 1908, tags: ["UTILITARIAN", "ARCHIVAL", "TAILORED"], basis: "founded in Saint-Jean-de-Moirans, France in 1908 by Rémy-Alexis Richard" },
  "Patagonia": { country: "United States", city: "Ventura", tags: ["GORP", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Ventura, California, in 1973" },
  "Paul Harnden Shoemakers": { country: "United Kingdom", foundedIn: "Canada", founded: 1987, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in England in 1987; Harnden is Canadian-born (Toronto), moved to Brighton in 1985 to learn traditional shoemaking" },
  "Paul Smith": { country: "United Kingdom", city: "Nottingham", founded: 1970, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Nottingham, England in 1970 by Paul Smith" },
  "Pendleton": { country: "United States", city: "Portland", founded: 1909, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Pendleton, Oregon in 1909 by the Bishop family; based in Portland" },
  "Perry Ellis": { country: "United States", city: "Doral", founded: 1978, tags: ["ARCHIVAL", "TAILORED", "MINIMAL"], basis: "founded in New York in 1978 by Perry Ellis; company now Perry Ellis International, based in Doral, Florida" },
  "Peter Do": { country: "United States", city: "New York", founded: 2018, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "founded in New York in 2018 by Vietnamese-American designer Peter Do" },
  "Phat Farm": { country: "United States", city: "New York", founded: 1992, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in 1992 by Russell Simmons, blending preppy style with hip-hop culture" },
  "Pleats Please Issey Miyake": { country: "Japan", city: "Tokyo", parent: "Issey Miyake", founded: 1993, tags: ["MINIMAL", "ARCHIVAL", "UTILITARIAN"], basis: "Issey Miyake's permanent-pleat womenswear line, launched 1993, Tokyo" },
  "Poème Bohémien": { country: "Italy", foundedIn: "France", founded: 2005, tags: ["ARCHIVAL", "AVANT-GARDE", "INDEPENDENT"], basis: "launched in Paris in 2005 as 'Nicolò Ceschi Berrini', renamed Poème Bohémien in 2010; the designer is Venetian, Italy" },
  "Polo Ralph Lauren": { country: "United States", city: "New York", parent: "Ralph Lauren", founded: 1967, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], aka: ["polo rl"], basis: "Ralph Lauren's flagship menswear/sportswear line, New York, launched 1967 as the company's first complete collection" },
  "Polo Sport": { country: "United States", city: "New York", parent: "Ralph Lauren", founded: 1992, tags: ["UTILITARIAN", "GORP", "STATEMENT"], basis: "Ralph Lauren's activewear line, New York, launched 1992" },
  "Post Archive Faction": { country: "South Korea", city: "Seoul", founded: 2018, tags: ["AVANT-GARDE", "UTILITARIAN", "ARCHIVAL"], aka: ["paf"], basis: "founded in Seoul in 2018 by Dongjoon Lim and Sookyo Jeong" },
  "PPFM": { country: "Japan", city: "Tokyo", founded: 1985, tags: ["STREETWEAR", "STATEMENT", "ARCHIVAL"], basis: "a Five Foxes Co. label founded in Tokyo in 1985, denim-focused punk and military streetwear" },
  "Prada": { country: "Italy", city: "Milan", tags: ["UTILITARIAN", "MINIMAL", "STATEMENT"], basis: "founded in Milan in 1913" },
  "Prada Linea Rossa": { country: "Italy", city: "Milan", parent: "Prada", founded: 1997, tags: ["UTILITARIAN", "MINIMAL", "STATEMENT"], aka: ["prada sport", "linea rossa"], basis: "the sportswear line of Prada, Milan (launched as Prada Sport 1997 under Neil Barrett, renamed Linea Rossa in 2009)" },
  "Puma": { country: "Germany", city: "Herzogenaurach", founded: 1948, tags: ["ARCHIVAL", "STREETWEAR", "MINIMAL"], basis: "founded in Herzogenaurach, Germany in 1948 by Rudolf Dassler" },
  "Pure Blue Japan": { country: "Japan", city: "Kurashiki", founded: 1997, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Kurashiki, Okayama in 1997 by Ken-ichi Iwaya, known for traditional aizome indigo dyeing" },
  "Pyer Moss": { country: "United States", city: "New York", founded: 2013, tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in New York City in 2013 by Kerby Jean-Raymond" },
  "Rabanne": { country: "France", foundedIn: "Spain", city: "Paris", founded: 1966, tags: ["STATEMENT", "AVANT-GARDE", "ARCHIVAL"], basis: "founded in Paris in 1966 by Spanish designer Paco Rabanne; renamed from 'Paco Rabanne' to 'Rabanne' in 2023" },
  "Raf Simons": { country: "Belgium", city: "Antwerp", tags: ["ARCHIVAL", "AVANT-GARDE", "INDEPENDENT"], basis: "founded in Antwerp in 1995" },
  "Ralph Lauren": { country: "United States", city: "New York", founded: 1967, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in New York in 1967 by Ralph Lauren" },
  "Red Wing Shoes": { country: "United States", city: "Red Wing", founded: 1905, tags: ["UTILITARIAN", "ARCHIVAL", "MINIMAL"], basis: "founded in Red Wing, Minnesota in 1905 by Charles H. Beckman" },
  "Reebok": { country: "United States", foundedIn: "United Kingdom", city: "Boston", founded: 1958, tags: ["ARCHIVAL", "STREETWEAR", "UTILITARIAN"], basis: "founded in Bolton, England in 1958 by brothers Jeff and Joe Foster" },
  "Represent": { country: "United Kingdom", city: "London", founded: 2011, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], basis: "founded in Horwich, Greater Manchester in 2011 by brothers George and Michael Heaton" },
  "Rhude": { country: "United States", city: "Los Angeles", founded: 2015, tags: ["STREETWEAR", "STATEMENT"], basis: "founded in Los Angeles in 2015 by Rhuigi Villaseñor" },
  "Rick Owens": { country: "France", foundedIn: "United States", city: "Paris", tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], basis: "founded in Los Angeles in 1994, run from Paris since 2003" },
  "Rick Owens DRKSHDW": { country: "France", city: "Paris", parent: "Rick Owens", founded: 2005, tags: ["UTILITARIAN", "STREETWEAR", "MINIMAL"], aka: ["drkshdw", "dark shadow"], basis: "diffusion line of Rick Owens launched in 2005, replacing the earlier SLAB line; run from Rick Owens' Paris headquarters" },
  "Rick Owens Lilies": { country: "France", city: "Paris", parent: "Rick Owens", tags: ["MINIMAL", "TAILORED", "SEDUCTIVE"], basis: "one of several secondary labels under Rick Owens, run from the same Paris headquarters as the main line" },
  "ROA": { country: "Italy", founded: 2015, tags: ["UTILITARIAN", "GORP", "STATEMENT"], basis: "founded in Italy in 2015, named after the Forcella della Roa mountain trail" },
  "Roberto Cavalli": { country: "Italy", city: "Milan", founded: 1975, tags: ["SEDUCTIVE", "STATEMENT"], basis: "founded in Florence in 1975 by Roberto Cavalli; now based in Milan" },
  "Rocawear": { country: "United States", city: "New York", founded: 1999, tags: ["STREETWEAR", "ARCHIVAL", "STATEMENT"], basis: "founded in New York City in 1999 by Damon Dash and Shawn \"Jay-Z\" Carter" },
  "Roen": { country: "Japan", city: "Tokyo", founded: 2001, tags: ["STATEMENT", "SEDUCTIVE", "ARCHIVAL"], basis: "founded in Tokyo in 2001 by Hiromu Takahara, dark avant-garde rock fashion with a signature skull motif" },
  "Rokh": { country: "United Kingdom", city: "London", founded: 2016, tags: ["TAILORED", "STATEMENT", "MINIMAL"], basis: "founded in London in 2016 by Seoul-born, Texas-raised designer Rok Hwang; shows on the official Paris Fashion Week schedule since 2019" },
  "Russell Athletic": { country: "United States", city: "Bowling Green", founded: 1902, tags: ["ARCHIVAL", "UTILITARIAN", "STREETWEAR"], basis: "founded in Alexander City, Alabama in 1902 by Benjamin Russell" },
  "Sacai": { country: "Japan", city: "Tokyo", tags: ["AVANT-GARDE", "STREETWEAR", "UTILITARIAN"], basis: "founded in Tokyo in 1999" },
  "Saint Laurent": { country: "France", city: "Paris", tags: ["SEDUCTIVE", "TAILORED", "STATEMENT"], basis: "founded in Paris in 1961" },
  "Salomon": { country: "France", city: "Annecy", tags: ["GORP", "STREETWEAR", "UTILITARIAN"], basis: "founded in Annecy in 1947; the head office is at Épagny-Metz-Tessy outside the town" },
  "Samurai Jeans": { country: "Japan", city: "Osaka", founded: 1997, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in Osaka in 1997 by Toru Nogami, known for heavyweight 15–25oz selvedge denim" },
  "Sankuanz": { country: "China", city: "Xiamen", founded: 2008, tags: ["STREETWEAR", "AVANT-GARDE", "UTILITARIAN"], basis: "founded in Xiamen, China in 2008 by Shangguan Zhe" },
  "Sasquatchfabrix": { country: "Japan", city: "Tokyo", founded: 2003, tags: ["UTILITARIAN", "STREETWEAR", "STATEMENT"], basis: "founded in Tokyo in 2003, military and workwear-mixed streetwear" },
  "Schott NYC": { country: "United States", city: "New York", founded: 1913, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "founded in New York in 1913 by brothers Irving and Jack Schott" },
  "Sean John": { country: "United States", city: "New York", founded: 1998, tags: ["STATEMENT", "TAILORED", "STREETWEAR"], basis: "founded in New York City in 1998 by Sean Combs" },
  "Sergio Tacchini": { country: "Italy", city: "Bellinzago Novarese", founded: 1966, tags: ["ARCHIVAL", "TAILORED", "STATEMENT"], basis: "founded in Bellinzago Novarese, Italy in 1966 by tennis player Sergio Tacchini" },
  "Share Spirit": { country: "Japan", city: "Tokyo", founded: 2000, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Tokyo (Daikanyama) in 2000 by Hikaru Katano, distressed leather and military-romantic mix sourced from global travel" },
  "Simone Rocha": { country: "United Kingdom", city: "London", founded: 2010, tags: ["SEDUCTIVE", "AVANT-GARDE", "STATEMENT"], basis: "founded in London in 2010 by Irish designer Simone Rocha" },
  "Situationist": { country: "Georgia", city: "Tbilisi", founded: 2015, tags: ["AVANT-GARDE", "UTILITARIAN", "STATEMENT"], basis: "founded in Tbilisi, Georgia in 2015 by Irakli Rusadze and Davit Giorgadze" },
  "Snow Peak": { country: "Japan", city: "Sanjō", tags: ["GORP", "MINIMAL", "UTILITARIAN"], basis: "founded in Sanjō, Niigata, in 1958" },
  "Song for the Mute": { country: "Australia", city: "Sydney", founded: 2010, tags: ["AVANT-GARDE", "MINIMAL", "INDEPENDENT"], basis: "founded in Sydney in 2010 by Melvin Tanaya and Lyna Ty" },
  "Sonia Rykiel": { country: "France", city: "Paris", founded: 1968, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Paris in 1968 by French designer Sonia Rykiel, the 'Queen of Knits'" },
  "Soulland": { country: "Denmark", city: "Copenhagen", founded: 2002, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], basis: "founded in Copenhagen in 2002 by teenage skate friends Silas Adler and Jacob Kampp Berliner" },
  "South2 West8": { country: "Japan", city: "Tokyo", parent: "Nepenthes", founded: 2002, tags: ["UTILITARIAN", "GORP", "ARCHIVAL"], basis: "a Nepenthes-group fishing/outdoor-inspired line founded 2002, named for its Sapporo, Hokkaido flagship's address" },
  "Starter": { country: "United States", city: "New Haven", founded: 1971, tags: ["STREETWEAR", "ARCHIVAL", "UTILITARIAN"], basis: "founded in New Haven, Connecticut in 1971 by David Beckerman, originally for high-school team uniforms" },
  "Stine Goya": { country: "Denmark", city: "Copenhagen", founded: 2006, tags: ["STATEMENT", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Copenhagen in 2006 by designer Stine Goya (Stine Nistrup Madsen)" },
  "Stone Island": { country: "Italy", city: "Ravarino", tags: ["UTILITARIAN", "GORP", "STREETWEAR"], basis: "founded in 1982, part of the Ravarino-based group" },
  "Stone Island Shadow Project": { country: "Italy", city: "Ravarino", parent: "Stone Island", founded: 2008, tags: ["UTILITARIAN", "GORP", "AVANT-GARDE"], basis: "the experimental sub-line of Stone Island (Ravarino, Italy, founded 1982 by Massimo Osti); Shadow Project launched 2008 with Errolson Hugh" },
  "Studio D'Artisan": { country: "Japan", city: "Osaka", founded: 1979, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], aka: ["studio dartisan"], basis: "founded in Osaka in 1979, the original 'Osaka Five' brand that pioneered Japanese selvedge reproduction denim" },
  "Studio Nicholson": { country: "United Kingdom", city: "London", founded: 2010, tags: ["MINIMAL", "TAILORED"], basis: "founded in London in 2010 by Nick Wakeman" },
  "Stüssy": { country: "United States", city: "Laguna Beach", tags: ["STREETWEAR", "INDEPENDENT"], aka: ["stussy"], basis: "founded in Laguna Beach, California, around 1980" },
  "Sugar Cane": { country: "Japan", city: "Tokyo", tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], basis: "a workwear/denim brand of Toyo Enterprise (founded Tokyo 1965 by Susumu Kobayashi), emerging as Toyo's flagship label after 1975" },
  "Sulvam": { country: "Japan", city: "Tokyo", founded: 2013, tags: ["AVANT-GARDE", "TAILORED", "ARCHIVAL"], basis: "founded in Tokyo in 2013 by Teppei Fujita, a former Yohji Yamamoto patternmaker" },
  "Sunspel": { country: "United Kingdom", city: "Long Eaton", founded: 1860, tags: ["MINIMAL", "ARCHIVAL", "TAILORED"], basis: "founded in Nottingham, England in 1860 by Thomas Arthur Hill; renamed Sunspel in 1935" },
  "Supreme": { country: "United States", city: "New York", tags: ["STREETWEAR", "STATEMENT"], basis: "founded in New York in 1994" },
  "TakahiroMiyashita TheSoloist.": { country: "Japan", city: "Tokyo", founded: 2010, tags: ["AVANT-GARDE", "INDEPENDENT", "ARCHIVAL"], aka: ["takahiromiyashita", "the soloist", "thesoloist"], basis: "founded in Tokyo in 2010 by Takahiro Miyashita after closing Number (N)ine in 2009" },
  "Tao Comme des Garçons": { country: "Japan", city: "Tokyo", parent: "Comme des Garçons", founded: 2005, tags: ["AVANT-GARDE", "ARCHIVAL", "STATEMENT"], basis: "Tao Kurihara's personal-name CDG line, Tokyo, shown 2005–2011; the CDG Tricot line she also designed was rebranded 'tao' in Oct 2021" },
  "Telfar": { country: "United States", city: "New York", founded: 2005, tags: ["INDEPENDENT", "STATEMENT", "MINIMAL"], basis: "founded in New York City in 2005 by Telfar Clemens" },
  "Teva": { country: "United States", city: "Goleta", founded: 1984, tags: ["GORP", "UTILITARIAN", "MINIMAL"], basis: "invented in Arizona in 1984 by river guide Mark Thatcher; now a Deckers Brands label" },
  "The North Face": { country: "United States", city: "Denver", founded: 1968, tags: ["GORP", "STREETWEAR", "UTILITARIAN"], aka: ["tnf", "north face"], basis: "founded in San Francisco in 1968 by Douglas Tompkins and Susie Tompkins Buell" },
  "The North Face Purple Label": { country: "Japan", city: "Tokyo", founded: 2003, tags: ["TAILORED", "GORP", "MINIMAL"], basis: "Japan-exclusive line launched in 2003, designed by nanamica's Eiichiro Homma under license from Goldwin" },
  "The Row": { country: "United States", city: "New York", tags: ["MINIMAL", "TAILORED"], basis: "founded in Los Angeles in 2006, run from New York" },
  "Thebe Magugu": { country: "South Africa", city: "Johannesburg", founded: 2016, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "founded in Johannesburg, South Africa in 2016 by Thebe Magugu" },
  "Toast": { country: "United Kingdom", city: "London", founded: 1997, tags: ["MINIMAL", "ARCHIVAL", "TAILORED"], kb: false, basis: "founded in Wales in 1997 by Jamie and Jessica Seaton" },
  "Toga": { country: "Japan", city: "Tokyo", founded: 1997, tags: ["TAILORED", "STATEMENT", "ARCHIVAL"], kb: false, basis: "founded in Tokyo in 1997 by Yasuko Furuta after studying at Esmod Paris, Western tailoring mixed with Japanese sensibility" },
  "Tom Ford": { country: "United States", city: "New York", founded: 2005, tags: ["SEDUCTIVE", "TAILORED"], basis: "founded in New York in 2005 by Tom Ford, ex-creative director of Gucci (1994–2004)" },
  "Tommy Hilfiger": { country: "United States", city: "New York", founded: 1985, tags: ["STATEMENT", "ARCHIVAL", "STREETWEAR"], basis: "founded in New York in 1985 by Tommy Hilfiger, backed by the Murjani Group" },
  "Tornado Mart": { country: "Japan", city: "Tokyo", founded: 1993, tags: ["TAILORED", "STATEMENT", "ARCHIVAL"], basis: "a Spic International label founded in Tokyo in 1993, slim-silhouette menswear (added Tornado Mart Femme in 2000)" },
  "Toteme": { country: "Sweden", foundedIn: "United States", city: "Stockholm", founded: 2014, tags: ["MINIMAL", "TAILORED"], basis: "founded in New York in 2014 by Elin Kling and Karl Lindman; moved to Stockholm in 2016" },
  "Trapstar": { country: "United Kingdom", city: "London", founded: 2008, tags: ["STREETWEAR", "STATEMENT", "INDEPENDENT"], basis: "founded in West London in 2008 by three childhood friends known as Mikey, Lee and Will" },
  "True Religion": { country: "United States", city: "Gardena", founded: 2002, tags: ["STREETWEAR", "STATEMENT", "ARCHIVAL"], basis: "founded in Vernon, California in 2002 by Jeff Lubell and Kym Gold" },
  "Uma Wang": { country: "China", city: "Shanghai", founded: 2009, tags: ["ARCHIVAL", "TAILORED", "MINIMAL"], basis: "founded in Shanghai in 2009 by Chinese designer Uma Wang, produced in Italy" },
  "Umbro": { country: "United Kingdom", city: "Manchester", founded: 1924, tags: ["ARCHIVAL", "UTILITARIAN", "STREETWEAR"], basis: "founded in Wilmslow, England in 1924 by brothers Harold and Wallace Humphreys" },
  "Undercover": { country: "Japan", city: "Tokyo", tags: ["AVANT-GARDE", "STREETWEAR", "INDEPENDENT"], basis: "founded in Tokyo in 1990 by Jun Takahashi" },
  "Uniqlo": { country: "Japan", city: "Yamaguchi", founded: 1984, tags: ["MINIMAL", "UTILITARIAN", "TAILORED"], basis: "first Uniqlo store opened in Hiroshima, Japan in 1984 under Tadashi Yanai" },
  "United Arrows": { country: "Japan", city: "Tokyo", founded: 1989, tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Japan in 1989 by Yasuto Kamoshita, Hirofumi Kurino and Osamu Shigematsu as a select-shop retailer" },
  "Universal Works": { country: "United Kingdom", city: "Nottingham", founded: 2008, tags: ["UTILITARIAN", "MINIMAL", "ARCHIVAL"], basis: "founded in Nottingham in 2008 by David Keyte and Stephanie Porritt" },
  "Valentino": { country: "Italy", city: "Rome", founded: 1960, tags: ["SEDUCTIVE", "TAILORED", "ARCHIVAL"], basis: "founded in Rome in 1960 by Valentino Garavani" },
  "Vans": { country: "United States", city: "Costa Mesa", founded: 1966, tags: ["STREETWEAR", "ARCHIVAL", "UTILITARIAN"], basis: "founded in Anaheim, California in 1966 by Paul Van Doren, James Van Doren and Gordon Lee as the Van Doren Rubber Company" },
  "Vanson Leathers": { country: "United States", city: "Fall River", founded: 1974, tags: ["UTILITARIAN", "INDEPENDENT", "ARCHIVAL"], basis: "founded in 1974 by Michael Van der Sleesen; based in Fall River, Massachusetts since the late 1980s" },
  "Vaquera": { country: "United States", city: "New York", founded: 2013, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in New York City in 2013 by Patric DiCaprio and Bryn Taubensee, with Claire Sullivan and David Moses" },
  "Veilance": { country: "Canada", city: "North Vancouver", parent: "Arc'teryx", founded: 2009, tags: ["MINIMAL", "UTILITARIAN", "TAILORED"], basis: "launched in 2009 as Arc'teryx's urban technical apparel line" },
  "Vejas": { country: "France", city: "Paris", founded: 2014, tags: ["AVANT-GARDE", "MINIMAL", "STATEMENT"], basis: "launched in 2014 by Canadian designer Vejas Kruszewski, who now runs the label from Paris" },
  "Versace": { country: "Italy", city: "Milan", founded: 1978, tags: ["SEDUCTIVE", "STATEMENT"], aka: ["gianni versace"], basis: "founded in Milan in 1978 by Gianni Versace" },
  "Vetements": { country: "Switzerland", foundedIn: "France", city: "Zurich", tags: ["STATEMENT", "STREETWEAR", "AVANT-GARDE"], basis: "founded in Paris in 2014, moved to Zurich in 2018" },
  "Viberg": { country: "Canada", city: "Victoria", founded: 1931, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], basis: "founded in Saskatchewan, Canada in 1931 by Ed Viberg; now based in Victoria, BC" },
  "Visvim": { country: "Japan", city: "Tokyo", tags: ["ARCHIVAL", "INDEPENDENT", "UTILITARIAN"], basis: "founded in Tokyo in 2000 by Hiroki Nakamura" },
  "Vivienne Westwood": { country: "United Kingdom", city: "London", founded: 1971, tags: ["STATEMENT", "INDEPENDENT", "SEDUCTIVE"], basis: "grew out of the King's Road boutique (Let It Rock, 1971; later Sex and Seditionaries) into the fashion house; British" },
  "Von Dutch": { country: "United States", founded: 1999, tags: ["STREETWEAR", "STATEMENT", "ARCHIVAL"], basis: "founded in Los Angeles in 1999, trading on the posthumous name of pinstriper Kenneth \"Von Dutch\" Howard" },
  "Wales Bonner": { country: "United Kingdom", city: "London", tags: ["TAILORED", "ARCHIVAL", "INDEPENDENT"], basis: "founded in London in 2014" },
  "Walter Van Beirendonck": { country: "Belgium", city: "Antwerp", founded: 1983, tags: ["AVANT-GARDE", "STATEMENT", "INDEPENDENT"], basis: "founded in Antwerp in 1983; Van Beirendonck is Belgian and a member of the Antwerp Six" },
  "Warehouse & Co.": { country: "Japan", city: "Osaka", founded: 1995, tags: ["ARCHIVAL", "UTILITARIAN", "INDEPENDENT"], kb: false, basis: "founded in Osaka in 1995 by brothers Kenichi and Koji Shiotani, part of the 'Osaka Five' vintage-denim reproduction makers" },
  "White Mountaineering": { country: "Japan", city: "Tokyo", founded: 2006, tags: ["UTILITARIAN", "GORP", "TAILORED"], basis: "founded in Tokyo in 2006 by Yosuke Aizawa, outdoor-inspired tailoring" },
  "Willy Chavarria": { country: "United States", city: "New York", tags: ["STATEMENT", "TAILORED", "INDEPENDENT"], basis: "founded in New York in 2015" },
  "Wood Wood": { country: "Denmark", city: "Copenhagen", founded: 2002, tags: ["STREETWEAR", "MINIMAL", "INDEPENDENT"], basis: "founded in Copenhagen in 2002 by Karl-Oskar Olsen and Brian SS Jensen as a T-shirt shop" },
  "Wooyoungmi": { country: "South Korea", foundedIn: "France", city: "Seoul", founded: 2002, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "launched in Paris in 2002 by Korean designer Woo Young-mi, who had run the Seoul label Solid Homme since 1988" },
  "Wrangler": { country: "United States", city: "Greensboro", founded: 1904, tags: ["UTILITARIAN", "ARCHIVAL", "INDEPENDENT"], basis: "originated as the Hudson Overall Company (1904, Greensboro NC), became Blue Bell in 1919; the Wrangler brand name was adopted in 1943" },
  "Wtaps": { country: "Japan", city: "Tokyo", founded: 1996, tags: ["STREETWEAR", "UTILITARIAN"], basis: "founded in Tokyo in 1996 by Tetsu Nishiyama, military-inspired Ura-Harajuku streetwear" },
  "Xander Zhou": { country: "China", city: "Beijing", founded: 2007, tags: ["AVANT-GARDE", "STATEMENT", "TAILORED"], basis: "founded in Beijing in 2007 by Xander Zhou, who shows collections at London Fashion Week Men's" },
  "Y-3": { country: "Japan", city: "Tokyo", founded: 2003, tags: ["MINIMAL", "STATEMENT", "UTILITARIAN"], basis: "a joint sport-luxury line between Yohji Yamamoto (Tokyo) and Adidas (Germany), debuted 2003" },
  "Y's": { country: "Japan", city: "Tokyo", parent: "Yohji Yamamoto", founded: 1977, tags: ["TAILORED", "MINIMAL", "ARCHIVAL"], basis: "Yohji Yamamoto's first womenswear line, debuted 1977, 'men's clothes for women'" },
  "Y/Project": { country: "France", city: "Paris", tags: ["AVANT-GARDE", "STATEMENT", "ARCHIVAL"], aka: ["y project", "yproject"], basis: "founded in Paris in 2010; went into receivership and ceased operations in January 2025" },
  "Yeezy": { country: "United States", founded: 2013, tags: ["MINIMAL", "STREETWEAR", "AVANT-GARDE"], basis: "founded by Kanye West, debuting as a clothing line in 2013/2015; Yeezy LLC registered in Delaware in 2016" },
  "Yeezy Gap": { country: "United States", founded: 2020, tags: ["MINIMAL", "UTILITARIAN", "STATEMENT"], basis: "a 2020 line/collaboration between Kanye West's Yeezy and Gap Inc., first product releasing 2021" },
  "Yohji Yamamoto": { country: "Japan", city: "Tokyo", tags: ["AVANT-GARDE", "ARCHIVAL", "MINIMAL"], basis: "founded in Tokyo in 1981" },
  "Yohji Yamamoto Pour Homme": { country: "Japan", city: "Tokyo", parent: "Yohji Yamamoto", founded: 1973, tags: ["AVANT-GARDE", "TAILORED", "ARCHIVAL"], aka: ["yohji pour homme", "pour homme"], basis: "the menswear collection of Yohji Yamamoto's house (Y's Co. established 1973), shown each Paris Fashion Week" },
  "Yves Saint Laurent Rive Gauche": { country: "France", city: "Paris", founded: 1966, tags: ["TAILORED", "ARCHIVAL", "STATEMENT"], basis: "ready-to-wear diffusion line launched in Paris in 1966, historically credited as the first designer ready-to-wear line" },
  "Zara": { country: "Spain", city: "Arteixo", founded: 1975, tags: ["TAILORED", "STATEMENT", "MINIMAL"], basis: "founded in A Coruña, Spain in 1975 by Amancio Ortega and Rosalía Mera" },
  "Zegna": { country: "Italy", city: "Milan", founded: 1910, tags: ["TAILORED", "MINIMAL"], basis: "founded in Trivero, Italy in 1910 by Ermenegildo Zegna; based in Milan" },
  "Ziggy Chen": { country: "China", city: "Shanghai", founded: 2012, tags: ["TAILORED", "ARCHIVAL", "MINIMAL"], basis: "founded in Shanghai in 2012 by Chinese designer Ziggy Chen (born Wuhan, 1969)" },
  // Namacheko was DELIBERATELY ABSENT from 21 Aug to 11 Sep 2026 — the
  // house's base could not be stated with confidence, and originCoverage()
  // counted the hole. The 11 Sep verification pass read its Antwerp base
  // from the record, so it is a row now. The rule stands: a house this file
  // is not confident about is absent, never guessed.
};

// A HOUSE ANSWERS TO EVERY NAME IT ANSWERS TO (11 Sep 2026). The index used
// to hold the display name alone, so `houseOrigin("cdg")` was null while the
// brain resolved "cdg" to Comme des Garçons perfectly well — the origin half
// of the register knew less than the taste half about the same house. Names,
// trade short forms and brain-only spellings all index here, folded the way
// the tokenizer folds (lib/brain/kb.js), so punctuation and diacritics cannot
// decide whether a house is findable. A display name still wins a collision:
// short forms are added only where nothing has claimed the key.
const norm = (s) => String(s || "").toLowerCase().trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const BY_NORM = new Map();
for (const [brand, rec] of Object.entries(HOUSES)) BY_NORM.set(norm(brand), { brand, ...rec });
for (const [brand, rec] of Object.entries(HOUSES)) {
  for (const alias of [...(HOUSE_SHORT_FORMS[brand] || []), ...(rec.aka || [])]) {
    const key = norm(alias);
    if (key && !BY_NORM.has(key)) BY_NORM.set(key, { brand, ...rec });
  }
}

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

// ---- THE REGISTER FEEDS THE BRAIN (knowledge round, 11 Sep 2026) ---------
// Until this round the brain's designer table (lib/brain/kb.js KB_DESIGNERS)
// and this origin table were two hand-kept lists of the same houses, and they
// had drifted: 83 of 126 designer keys had no origin row, 20 origin rows had
// no designer key, and 12 of the catalog's own 64 brands produced an EMPTY
// taste vector (scripts/measure-house-reading.mjs). One register now carries
// both facts — where a house is from and what it is known for — and the
// brain DERIVES its keys from it: the brand name, its trade short forms, and
// any brain-only spellings in `aka`. A row marked `kb: false` is a house whose
// name is also an ordinary listing word ("Hope", "Toast", "Gap"): its origin
// stays answerable, but the free-text bridge must not read the word as the
// house. `tags` are the three canonical aesthetics the house is KNOWN for,
// strongest first — editorial, like every other reading in this file.

/** Every key the brain should answer with a house's aesthetics: key → tags. */
export function houseKbEntries() {
  const out = Object.create(null);
  for (const [brand, rec] of Object.entries(HOUSES)) {
    if (rec.kb === false || !Array.isArray(rec.tags) || !rec.tags.length) continue;
    const keys = [brand, ...(HOUSE_SHORT_FORMS[brand] || []), ...(rec.aka || [])];
    for (const k of keys) out[k] = rec.tags;
  }
  return out;
}

/** The house a brain key stands for (brand name, short form or aka), or null. */
export function houseForKbKey(key) {
  const k = norm(key);
  if (!k) return null;
  for (const [brand, rec] of Object.entries(HOUSES)) {
    if (rec.kb === false) continue;
    if (norm(brand) === k) return brand;
    if ((HOUSE_SHORT_FORMS[brand] || []).some((f) => norm(f) === k)) return brand;
    if ((rec.aka || []).some((f) => norm(f) === k)) return brand;
  }
  return null;
}

/** How much of a brand list this table covers — the hole, said out loud. */
export function originCoverage(brands = []) {
  const seen = [...new Set(brands.map(norm).filter(Boolean))];
  const known = seen.filter((b) => BY_NORM.has(b));
  return { total: seen.length, known: known.length, missing: seen.filter((b) => !BY_NORM.has(b)) };
}
