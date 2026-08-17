// Generated for route metadata only. The page itself is a client component and
// cannot export `metadata`, so the segment layout carries it. This renders its
// children unchanged — it adds no markup.
import { siteUrl } from "../../lib/site.js";

export const metadata = {
  title: "THE WIRE",
  description:
    "Posts and the hotlist — what the magazine is reading and wearing right now.",
  alternates: { canonical: "/hotlist" },
  openGraph: {
    title: "THE WIRE · *ASILUM",
    description:
      "Posts and the hotlist — what the magazine is reading and wearing right now.",
    url: siteUrl("/hotlist"),
    siteName: "*ASILUM",
    type: "website",
    locale: "en_US",
  },
};

export default function Layout({ children }) {
  return children;
}
