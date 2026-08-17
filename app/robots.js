// app/robots.js — served at /robots.txt (Next.js metadata route).
// NOTE on /piece/<id>: deliberately NOT listed below. It ships a meta
// `noindex` (app/piece/[id]/page.js) so a synthetic product stays out of search
// results, but it must stay CRAWLABLE — a robots.txt disallow would stop a
// social scraper fetching the page, and reading that card is the only reason
// the route exists. noindex and disallow are different jobs.
//
// Crawlers are welcome on the editorial surfaces. Personal surfaces
// (orders, profile, settings, moodboard training, Asterisk memory, stats)
// and the API are not search material — they render per-identity state and
// belong to the reader, not the index. Keep this list in step with
// app/sitemap.js when pages are added.
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/orders",
          "/profile",
          "/settings",
          "/board",
          "/asterisk",
          "/stats",
          "/upload",
        ],
      },
    ],
    sitemap: "https://www.asilummagazine.com/sitemap.xml",
  };
}
