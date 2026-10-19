// app/sitemap.js — served at /sitemap.xml (Next.js metadata route).
// Only the public editorial surfaces; personal pages are robots-disallowed
// (app/robots.js) and never listed. Public rooms (/u/[handle]) stay
// crawlable but are not enumerated here — they enter the index through
// links, not a directory. lastModified is deliberately omitted: a build
// date would claim freshness the content may not have.
import { SITE_ORIGIN } from "../lib/site.js";

const BASE = SITE_ORIGIN;

export default function sitemap() {
  return [
    { url: BASE + "/", changeFrequency: "daily", priority: 1 },
    { url: BASE + "/cover", changeFrequency: "daily", priority: 0.9 },
    { url: BASE + "/discover", changeFrequency: "daily", priority: 0.9 },
    { url: BASE + "/hotlist", changeFrequency: "daily", priority: 0.8 },
    { url: BASE + "/stylist", changeFrequency: "weekly", priority: 0.7 },
    { url: BASE + "/privacy", changeFrequency: "monthly", priority: 0.3 },
    { url: BASE + "/terms", changeFrequency: "monthly", priority: 0.3 },
    { url: BASE + "/accessibility", changeFrequency: "monthly", priority: 0.3 },
  ];
}
