// Generated for route metadata only. The page itself is a client component and
// cannot export `metadata`, so the segment layout carries it. This renders its
// children unchanged — it adds no markup.
export const metadata = {
  title: "THE DESK",
  // This surface renders per-identity state. It belongs to the reader, not the
  // index — so it is noindex in the page itself, not only in robots.txt.
  robots: { index: false, follow: false },
  // Self-referential, NOT inherited. Without this the root's canonical of "/"
  // is inherited, and the page tells a crawler "my content really lives at the
  // homepage" while also saying "do not index me" — two contradictory signals
  // about the same URL.
  alternates: { canonical: "/admin" },
};

export default function Layout({ children }) {
  return children;
}
