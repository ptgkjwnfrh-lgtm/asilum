// app/robots.js — served at /robots.txt (Next.js metadata route).
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
        ],
      },
    ],
    sitemap: "https://www.asilummagazine.com/sitemap.xml",
  };
}
