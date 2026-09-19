export const WIKIMEDIA_LANGUAGES = Object.freeze(["en", "fr", "it", "de", "es", "pt", "ja", "ko", "zh", "ar"]);

export const WIKIPEDIA_DISCOVERY_SOURCES = Object.freeze([
  { key: "asilum-career-registry", label: "ASILUM sourced career registry", type: "internal_registry", url: "internal://lib/people/careers.data.json", region: "global", seasonOrDate: "continuing", enabled: true },
  { key: "wikidata-fashion-designers", label: "Wikidata fashion-designer candidates", type: "wikidata", url: "https://query.wikidata.org/", region: "global", seasonOrDate: "continuing", enabled: true, classQid: "Q3501317" },
  { key: "wikidata-fashion-houses", label: "Wikidata fashion-house candidates", type: "wikidata", url: "https://query.wikidata.org/", region: "global", seasonOrDate: "continuing", enabled: true, classQid: "Q1941779" },
  { key: "wikidata-language-only-designers", label: "Wikidata designers with French Wikipedia coverage and no English article", type: "wikidata", url: "https://query.wikidata.org/", region: "global", seasonOrDate: "continuing", enabled: true, classQid: "Q3501317", language: "fr", requireNoEnglish: true },
  { key: "enwiki-fashion-designers", label: "English Wikipedia fashion designers", type: "wikipedia_category", url: "https://en.wikipedia.org/wiki/Category:Fashion_designers", region: "global", seasonOrDate: "continuing", enabled: true, language: "en", category: "Category:Fashion designers" },
  { key: "enwiki-fashion-houses", label: "English Wikipedia fashion houses", type: "wikipedia_category", url: "https://en.wikipedia.org/wiki/Category:Fashion_houses", region: "global", seasonOrDate: "continuing", enabled: true, language: "en", category: "Category:Fashion houses" },
  { key: "operator-wikipedia-mapping", label: "Reviewed operator Wikipedia mappings", type: "internal_registry", url: "operator://wikipedia-mapping", region: "global", seasonOrDate: "continuing", enabled: false, accessMode: "manual" },
  { key: "fashion-week-official", label: "Official fashion-week calendars and archives", type: "fashion_week", url: "operator://official-fashion-week-registry", region: "global", seasonOrDate: "seasonal", enabled: false, accessMode: "manual" },
  { key: "boutique-directories", label: "Reviewed multi-brand boutique directories", type: "boutique_directory", url: "operator://boutique-source-registry", region: "global", seasonOrDate: "historical-and-current", enabled: false, accessMode: "manual" },
]);

export function discoverySource(key) {
  return WIKIPEDIA_DISCOVERY_SOURCES.find((source) => source.key === key) || null;
}
