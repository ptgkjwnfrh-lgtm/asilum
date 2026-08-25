// Dated fashion-context snapshot for the stylist. Trend knowledge is an
// exploration signal, never a rewrite of a user's taste profile. Every entry
// expires and carries provenance so stale micro-trends cannot become "truth".

const SNAPSHOT_DATE = "2026-07-17";
const SNAPSHOT_EXPIRES = "2026-10-15";

const TREND_SOURCES = Object.freeze({
  tiktok2026: {
    title: "TikTok-facing fashion trends for 2026",
    url: "https://www.whowhatwear.com/fashion/trends/tiktok-fashion-trends-2026",
    publisher: "Who What Wear", observedAt: "2025-12-11", kind: "editorial-social-observation",
  },
  genZSummer: {
    title: "Gen Z summer 2026 micro-trends",
    url: "https://www.whowhatwear.com/fashion/trends/gen-z-micro-trends-summer-2026",
    publisher: "Who What Wear", observedAt: "2026-06-01", kind: "editorial-social-observation",
  },
  football2026: {
    title: "Football fashion around the 2026 World Cup",
    url: "https://www.whowhatwear.com/fashion/trends/football-fashion-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-06-14", kind: "editorial-social-observation",
  },
  layering2026: {
    title: "Spring 2026 creative layering",
    url: "https://www.whowhatwear.com/fashion/shopping/layering-trend-2026",
    publisher: "Who What Wear", observedAt: "2026-03-01", kind: "runway-editorial",
  },
  summer2026: {
    title: "Summer 2026 trend report",
    url: "https://www.whowhatwear.com/fashion/summer/summer-fashion-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-05-01", kind: "seasonal-editorial",
  },
  tiktokMethod: {
    title: "TikTok Next 2026 Trend Report",
    url: "https://ads.tiktok.com/business/library/TikTok_Next_2026_Trend_Report.pdf",
    publisher: "TikTok for Business", observedAt: "2026-02-01", kind: "platform-methodology",
  },
  // 2026-07-17 review sweep — observedAt is the date the claim was verified.
  boho2026: {
    title: "Boho Chic Has Grown Up — 7 Trends Defining the Aesthetic in 2026",
    url: "https://www.whowhatwear.com/fashion/trends/bohemian-fashion-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-07-17", kind: "editorial-social-observation",
  },
  footballShirts2026: {
    title: "Football shirts: stylish summer fashion trend 2026",
    url: "https://www.stylist.co.uk/fashion/football-fashion-trend/996240",
    publisher: "Stylist", observedAt: "2026-07-17", kind: "editorial-social-observation",
  },
  capri2026: {
    title: "7 Capri Trouser Trends For Summer 2026",
    url: "https://www.whowhatwear.com/fashion/trends/capri-trouser-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-07-17", kind: "runway-editorial",
  },
  capriWwd2026: {
    title: "Capri Pants Are Here to Stay — This Time With a More Polished Twist",
    url: "https://wwd.com/fashion-news/fashion-scoops/capri-pants-trend-2026-1238937779/",
    publisher: "WWD", observedAt: "2026-07-17", kind: "runway-editorial",
  },
  y2kSummer2026: {
    title: "If There's One Trend to Follow This Summer, Let It Be Y2K",
    url: "https://www.whowhatwear.com/fashion/summer/y2k-summer-fashion-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-07-17", kind: "editorial-social-observation",
  },
  wedgeScmp2026: {
    title: "Wedge heels are back: how to wear the Y2K trend",
    url: "https://www.scmp.com/lifestyle/fashion-beauty/article/3349333/wedge-heels-are-back-how-wear-y2k-trend-loved-britney-spears-and-paris-hilton",
    publisher: "South China Morning Post", observedAt: "2026-07-17", kind: "editorial-social-observation",
  },
  fallRunway2026: {
    title: "The 14 Best Fall 2026 Fashion Trends We Saw on the Runways",
    url: "https://www.wmagazine.com/fashion/fall-2026-fashion-trends",
    publisher: "W Magazine", observedAt: "2026-07-17", kind: "runway-editorial",
  },
  colour2026: {
    title: "These 7 Unexpected Colour Trends Will Break Through in 2026",
    url: "https://www.whowhatwear.com/fashion/trends/fashion-colour-trends-2026",
    publisher: "Who What Wear", observedAt: "2026-07-17", kind: "runway-editorial",
  },
});

// Platform methodology explains how TikTok describes trend discovery; it is
// not evidence for any individual garment claim. Keep it at snapshot level so
// model/audit consumers cannot mistake it for direct trend provenance.
export const FASHION_TREND_SNAPSHOT_META = Object.freeze({
  observedAt: SNAPSHOT_DATE,
  reviewBy: "2026-09-15",
  defaultExpiresAt: SNAPSHOT_EXPIRES,
  region: "US/UK/global fashion TikTok",
  methodology: TREND_SOURCES.tiktokMethod,
});

export const FASHION_TREND_SNAPSHOT = Object.freeze([
  {
    id: "athletic-shorts-contrast",
    name: "athletic shorts, dressed against type",
    summary: "Football, board, and track shorts paired with tailoring, crisp shirting, or refined shoes.",
    terms: ["athletic shorts", "football shorts", "board shorts", "track shorts", "sport shorts", "mesh shorts"],
    brainTags: { STREETWEAR: 0.8, UTILITARIAN: 0.45, TAILORED: 0.35 },
    confidence: 0.82,
    region: "US/UK/global fashion TikTok",
    sourceRefs: ["football2026", "genZSummer", "footballShirts2026"],
    expiresAt: "2026-10-15", lifecycle: "acceleration",
  },
  {
    id: "micro-oversized-proportions",
    name: "micro and oversized proportion play",
    summary: "Shrunken tops or micro skirts balanced by oversized trousers, outerwear, or flat shoes.",
    terms: ["micro skirt", "mini skirt", "shrunken cardigan", "tiny top", "cropped top", "oversized trousers", "oversized jacket"],
    brainTags: { SEDUCTIVE: 0.7, STATEMENT: 0.55, TAILORED: 0.3 },
    confidence: 0.78,
    region: "global fashion TikTok",
    sourceRefs: ["genZSummer", "summer2026", "fallRunway2026"],
    expiresAt: "2026-10-15", lifecycle: "acceleration",
  },
  {
    id: "indie-grunge-boho",
    name: "indie-grunge boho",
    summary: "Soft, flounced, or sheer bohemian pieces made less precious with leather, hardware, lace, paisley, and worn-in texture — suede now the signature fabric of the matured wave.",
    terms: ["boho", "sheer", "lace", "paisley", "tapestry", "fringe", "studded", "hardware", "leather", "suede"],
    brainTags: { INDEPENDENT: 0.85, ARCHIVAL: 0.65, SEDUCTIVE: 0.45, STATEMENT: 0.35 },
    confidence: 0.78,
    region: "US/UK fashion TikTok",
    sourceRefs: ["tiktok2026", "genZSummer", "boho2026"],
    expiresAt: "2026-12-31", lifecycle: "established",
  },
  {
    id: "layered-tops",
    name: "visible layered tops",
    summary: "Cropped tees, tanks, mesh, and collared shirts layered in deliberate color or texture contrast.",
    terms: ["layered top", "layered tee", "double layer", "mesh top", "graphic tee", "tank top", "collared shirt"],
    brainTags: { INDEPENDENT: 0.75, STREETWEAR: 0.55, ARCHIVAL: 0.4 },
    confidence: 0.8,
    region: "US/UK fashion TikTok",
    sourceRefs: ["tiktok2026", "layering2026"],
    expiresAt: "2026-12-31", lifecycle: "acceleration",
  },
  {
    id: "cropped-trousers-return",
    name: "cropped trousers and pedal pushers",
    summary: "Culottes, capris, long jorts, and pedal pushers — the 2026 iteration high-waisted and tailored, on the SS26 runways at multiple houses.",
    terms: ["culotte", "capri", "pedal pusher", "cropped trouser", "long jort", "bermuda short"],
    brainTags: { TAILORED: 0.65, ARCHIVAL: 0.5, INDEPENDENT: 0.35 },
    confidence: 0.8,
    region: "US/UK fashion TikTok",
    sourceRefs: ["tiktok2026", "summer2026", "capri2026", "capriWwd2026"],
    expiresAt: "2026-12-31", lifecycle: "established",
  },
  {
    id: "statement-denim",
    name: "altered and statement denim",
    summary: "Denim with embroidery, studs, patchwork, unusual washes, prints, or emphatic silhouette.",
    terms: ["statement denim", "embroidered denim", "studded denim", "patchwork denim", "printed denim", "dark wash skinny"],
    brainTags: { STATEMENT: 0.8, STREETWEAR: 0.55, ARCHIVAL: 0.35 },
    confidence: 0.74,
    region: "US fashion TikTok",
    sourceRefs: ["genZSummer", "summer2026"],
    expiresAt: "2026-09-15", lifecycle: "monitoring",
  },
  {
    id: "utility-waist-accessories",
    name: "utility belts at the waist",
    summary: "Oversized belts, carpenter pocket belts, and cargo belt bags used as a focal styling layer.",
    terms: ["oversized belt", "wide belt", "carpenter belt", "pocket belt", "cargo belt", "belt bag"],
    brainTags: { UTILITARIAN: 0.8, STATEMENT: 0.55, STREETWEAR: 0.45 },
    confidence: 0.76,
    region: "US/UK fashion TikTok",
    sourceRefs: ["tiktok2026", "genZSummer"],
    expiresAt: "2026-10-15", lifecycle: "established",
  },
  {
    id: "soft-color-reset",
    name: "soft color after beige minimalism",
    summary: "Butter yellow, powder blue, soft sage, and chalky off-white as gentle color — press now calls butter yellow waning into ochre and chartreuse for fall.",
    terms: ["butter yellow", "powder blue", "baby blue", "soft sage", "chalk white", "off white"],
    brainTags: { MINIMAL: 0.65, TAILORED: 0.35, INDEPENDENT: 0.25 },
    confidence: 0.74,
    region: "global fashion TikTok",
    sourceRefs: ["summer2026", "genZSummer", "colour2026"],
    expiresAt: "2026-09-15", lifecycle: "seasonal",
  },
  {
    id: "shield-eyewear",
    name: "oversized shield eyewear",
    summary: "Large, wraparound, aviator-derived sunglasses used as the sharpest part of a look.",
    terms: ["shield sunglasses", "shield glasses", "wraparound sunglasses", "oversized sunglasses", "aviator sunglasses"],
    brainTags: { STATEMENT: 0.75, GORP: 0.4, STREETWEAR: 0.35 },
    confidence: 0.7,
    region: "US fashion TikTok",
    sourceRefs: ["genZSummer"],
    expiresAt: "2026-09-15", lifecycle: "monitoring",
  },
  {
    id: "wedge-revival",
    name: "wedge revival",
    summary: "Wedge heels and wedge sneakers returning through Y2K and early-2010s nostalgia, now backed by major-label revivals and hype-index momentum.",
    terms: ["wedge heel", "wedge sandal", "wedge sneaker", "wedged trainer"],
    brainTags: { ARCHIVAL: 0.6, SEDUCTIVE: 0.45, STATEMENT: 0.35 },
    confidence: 0.72,
    region: "US/UK fashion TikTok",
    sourceRefs: ["tiktok2026", "summer2026", "y2kSummer2026", "wedgeScmp2026"],
    expiresAt: "2026-12-31", lifecycle: "established",
  },
].map((trend) => ({
  ...trend,
  observedAt: SNAPSHOT_DATE,
  expiresAt: trend.expiresAt || SNAPSHOT_EXPIRES,
  lifecycle: trend.lifecycle || "monitoring",
  sources: (trend.sourceRefs || []).map((ref) => TREND_SOURCES[ref]).filter(Boolean),
})));

const dateOnly = (value) => String(value instanceof Date ? value.toISOString() : value).slice(0, 10);

/**
 * The trends in force on a given date, strongest first.
 *
 * EVERY ENTRY IS DATED AND EXPIRES. A trend snapshot that never goes stale
 * would quietly become a claim about the present built from a fixed past, so
 * expired rows drop out rather than being served with an old date attached.
 *
 * `asOf` is injectable so the expiry behaviour is testable without waiting.
 * Trends are an EXPLORATION signal — they widen what a reader is shown and
 * never rewrite their taste profile.
 */
export function getCurrentFashionTrends({ asOf = new Date(), limit = 12 } = {}) {
  const day = dateOnly(asOf);
  return FASHION_TREND_SNAPSHOT
    .filter((trend) => trend.observedAt <= day && trend.expiresAt >= day)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, Math.max(0, limit));
}

function productText(product) {
  const colors = (product.colors || []).map((color) => color?.name || color);
  return [product.title, product.category, product.subcategory, product.description, product.material, ...colors]
    .filter(Boolean).join(" ").toLowerCase();
}

// Returns an explainable 0..1 relevance score. Textual product evidence is
// stronger than broad aesthetic overlap, which prevents every tagged product
// from being called trendy.
export function scoreProductTrendRelevance(product, trends = getCurrentFashionTrends()) {
  const text = productText(product);
  const tags = Object.fromEntries(Object.entries(product.tags || {}).map(([tag, weight]) => [tag.toUpperCase(), Number(weight) || 0]));
  let best = 0;
  let match = null;
  for (const trend of trends) {
    const termHits = trend.terms.filter((term) => text.includes(term)).length;
    if (termHits === 0) continue;
    const tagFit = Object.entries(trend.brainTags).reduce((sum, [tag, weight]) => sum + (tags[tag] || 0) * weight, 0);
    const evidence = Math.min(1, termHits * 0.55 + Math.min(0.35, tagFit * 0.12));
    const score = evidence * trend.confidence;
    if (score > best) { best = score; match = trend; }
  }
  return { score: +Math.min(1, best).toFixed(3), trend: match };
}

// Compact, structured model context; no article prose is copied into prompts.
export function getFashionTrendContext(options) {
  return getCurrentFashionTrends(options).map(({ id, name, summary, terms, brainTags, confidence, region, observedAt, expiresAt, lifecycle, sources }) => ({
    id, name, summary, terms, brainTags, confidence, region, observedAt, expiresAt, lifecycle,
    sources: sources.map(({ title, url, publisher, observedAt: sourceObservedAt, kind }) =>
      ({ title, url, publisher, observedAt: sourceObservedAt, kind })),
  }));
}
