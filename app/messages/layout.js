// Generated for route metadata only. The page itself is a client component and
// cannot export `metadata`, so the segment layout carries it. This renders its
// children unchanged — it adds no markup.
import { siteUrl } from "../../lib/site.js";

export const metadata = {
  title: "MESSAGES",
  description: "Your messages on ASILUM — echoes, conversations and requests.",
  alternates: { canonical: "/messages" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "MESSAGES · *ASILUM",
    description: "Your messages on ASILUM — echoes, conversations and requests.",
    url: siteUrl("/messages"),
    siteName: "*ASILUM",
    type: "website",
    locale: "en_US",
  },
};

export default function Layout({ children }) {
  return children;
}
