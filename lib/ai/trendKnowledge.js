// Dated fashion-context snapshot for the stylist. Trend knowledge is an
// exploration signal, never a rewrite of a user's taste profile. Every entry
// expires and carries provenance so stale micro-trends cannot become "truth".

const SNAPSHOT_DATE = "2026-07-13";
const SNAPSHOT_EXPIRES = "2026-10-01";

export const FASHION_TREND_SNAPSHOT = Object.freeze([
  {
    id: "athletic-shorts-contrast",
    name: "athletic shorts, dressed against type",
    summary: "Football, board, and track shorts paired with tailoring, crisp shirting, or refined shoes.",
    terms: ["athletic shorts", "football shorts", "board shorts", "track shorts", "sport shorts", "mesh shorts"],
    brainTags: { STREETWEAR: 0.8, UTILITARIAN: 0.45, TAILORED: 0.35 },
    confidence: 0.82,
    region: "US/UK/global fashion TikTok",
  },
  {
    id: "micro-oversized-proportions",
    name: "micro and oversized proportion play",
    summary: "Shrunken tops or micro skirts balanced by oversized trousers, outerwear, or flat shoes.",
    terms: ["micro skirt", "mini skirt", "shrunken cardigan", "tiny top", "cropped top", "oversized trousers", "oversized jacket"],
    brainTags: { SEDUCTIVE: 0.7, STATEMENT: 0.55, TAILORED: 0.3 },
    confidence: 0.78,
    region: "global fashion TikTok",
  },
  {
    id: "indie-grunge-boho",
    name: "indie-grunge boho",
    summary: "Soft, flounced, or sheer bohemian pieces made less precious with leather, hardware, lace, paisley, and worn-in texture.",
    terms: ["boho", "sheer", "lace", "paisley", "tapestry", "fringe", "studded", "hardware", "leather"],
    brainTags: { INDEPENDENT: 0.85, ARCHIVAL: 0.65, SEDUCTIVE: 0.45, STATEMENT: 0.35 },
    confidence: 0.76,
    region: "US/UK fashion TikTok",
  },
  {
    id: "layered-tops",
    name: "visible layered tops",
    summary: "Cropped tees, tanks, mesh, and collared shirts layered in deliberate color or texture contrast.",
    terms: ["layered top", "layered tee", "double layer", "mesh top", "graphic tee", "tank top", "collared shirt"],
    brainTags: { INDEPENDENT: 0.75, STREETWEAR: 0.55, ARCHIVAL: 0.4 },
    confidence: 0.8,
    region: "US/UK fashion TikTok",
  },
  {
    id: "cropped-trousers-return",
    name: "cropped trousers and pedal pushers",
    summary: "Culottes, capris, long jorts, and pedal pushers styled with loafers, boots, or compact tops.",
    terms: ["culotte", "capri", "pedal pusher", "cropped trouser", "long jort", "bermuda short"],
    brainTags: { TAILORED: 0.65, ARCHIVAL: 0.5, INDEPENDENT: 0.35 },
    confidence: 0.77,
    region: "US/UK fashion TikTok",
  },
  {
    id: "statement-denim",
    name: "altered and statement denim",
    summary: "Denim with embroidery, studs, patchwork, unusual washes, prints, or emphatic silhouette.",
    terms: ["statement denim", "embroidered denim", "studded denim", "patchwork denim", "printed denim", "dark wash skinny"],
    brainTags: { STATEMENT: 0.8, STREETWEAR: 0.55, ARCHIVAL: 0.35 },
    confidence: 0.74,
    region: "US fashion TikTok",
  },
  {
    id: "utility-waist-accessories",
    name: "utility belts at the waist",
    summary: "Oversized belts, carpenter pocket belts, and cargo belt bags used as a focal styling layer.",
    terms: ["oversized belt", "wide belt", "carpenter belt", "pocket belt", "cargo belt", "belt bag"],
    brainTags: { UTILITARIAN: 0.8, STATEMENT: 0.55, STREETWEAR: 0.45 },
    confidence: 0.76,
    region: "US/UK fashion TikTok",
  },
  {
    id: "soft-color-reset",
    name: "soft color after beige minimalism",
    summary: "Butter yellow, powder blue, soft sage, and chalky off-white used as gentle color rather than neutral-only minimalism.",
    terms: ["butter yellow", "powder blue", "baby blue", "soft sage", "chalk white", "off white"],
    brainTags: { MINIMAL: 0.65, TAILORED: 0.35, INDEPENDENT: 0.25 },
    confidence: 0.79,
    region: "global fashion TikTok",
  },
  {
    id: "shield-eyewear",
    name: "oversized shield eyewear",
    summary: "Large, wraparound, aviator-derived sunglasses used as the sharpest part of a look.",
    terms: ["shield sunglasses", "shield glasses", "wraparound sunglasses", "oversized sunglasses", "aviator sunglasses"],
    brainTags: { STATEMENT: 0.75, GORP: 0.4, STREETWEAR: 0.35 },
    confidence: 0.7,
    region: "US fashion TikTok",
  },
  {
    id: "wedge-revival",
    name: "wedge revival",
    summary: "Wedge heels and wedge sneakers returning through Y2K and early-2010s nostalgia.",
    terms: ["wedge heel", "wedge sandal", "wedge sneaker", "wedged trainer"],
    brainTags: { ARCHIVAL: 0.6, SEDUCTIVE: 0.45, STATEMENT: 0.35 },
    confidence: 0.68,
    region: "US/UK fashion TikTok",
  },
].map((trend) => ({
  ...trend,
  observedAt: SNAPSHOT_DATE,
  expiresAt: SNAPSHOT_EXPIRES,
  lifecycle: "acceleration",
  sources: [
    "https://www.voguearabia.com/article/tiktok-fashion-spring-summer-2026-trends",
    "https://www.whowhatwear.com/fashion/trends/tiktok-fashion-trends-2026",
    "https://www.whowhatwear.com/fashion/trends/gen-z-micro-trends-summer-2026",
  ],
})));

const dateOnly = (value) => String(value instanceof Date ? value.toISOString() : value).slice(0, 10);

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
    const tagFit = Object.entries(trend.brainTags).reduce((sum, [tag, weight]) => sum + (tags[tag] || 0) * weight, 0);
    const evidence = Math.min(1, termHits * 0.55 + Math.min(0.35, tagFit * 0.12));
    const score = evidence * trend.confidence;
    if (score > best) { best = score; match = trend; }
  }
  return { score: +Math.min(1, best).toFixed(3), trend: match };
}

// Compact, structured model context; no article prose is copied into prompts.
export function getFashionTrendContext(options) {
  return getCurrentFashionTrends(options).map(({ id, name, summary, terms, brainTags, confidence, region, observedAt, expiresAt, lifecycle }) => ({
    id, name, summary, terms, brainTags, confidence, region, observedAt, expiresAt, lifecycle,
  }));
}
