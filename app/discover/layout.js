// Generated for route metadata only. The page itself is a client component and
// cannot export `metadata`, so the segment layout carries it. This renders its
// children unchanged — it adds no markup.
import { siteUrl } from "../../lib/site.js";

export const metadata = {
  title: "DISCOVER",
  description:
    "The open index. A demo archive of synthetic sample records — the search is real; the clothes are not.",
  alternates: { canonical: "/discover" },
  openGraph: {
    title: "DISCOVER · *ASILUM magazine",
    description:
      "The open index. A demo archive of synthetic sample records — the search is real; the clothes are not.",
    url: siteUrl("/discover"),
    siteName: "*ASILUM magazine",
    type: "website",
    locale: "en_US",
  },
};

export default function Layout({ children }) {
  return children;
}
