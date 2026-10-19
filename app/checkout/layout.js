// Generated for route metadata only. The page itself is a client component and
// cannot export `metadata`, so the segment layout carries it. This renders its
// children unchanged — it adds no markup.
export const metadata = {
  title: "CHECKOUT",
  // The housing renders a per-item payment surface. It belongs to the buyer,
  // not the index — so it is noindex in the page itself, not only in
  // robots.txt (the seo test pins that the two never disagree).
  robots: { index: false, follow: false },
  // Self-referential, NOT inherited — same reasoning as /orders: without this
  // the root's canonical of "/" is inherited and the page sends two
  // contradictory signals about the same URL.
  alternates: { canonical: "/checkout" },
};

export default function Layout({ children }) {
  return children;
}
