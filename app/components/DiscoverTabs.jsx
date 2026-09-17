// app/components/DiscoverTabs.jsx — DISCOVER's inner row (V.2).
// One destination, five doors: the ranked grid (PIECES), the open index
// (SEARCH), the map (AROUND YOU), the sourced overviews (PEOPLE), and the
// looks engine (STYLIST). Plain links — the URL is the state.

const TABS = [
  { id: "pieces", href: "/", label: "PIECES" },
  { id: "search", href: "/discover", label: "SEARCH" },
  { id: "places", href: "/discover?tab=places", label: "AROUND YOU" },
  { id: "people", href: "/discover?tab=people", label: "PEOPLE" },
  { id: "stylist", href: "/stylist", label: "STYLIST" },
];

export default function DiscoverTabs({ current = "pieces" }) {
  return (
    <nav className="dtabs" aria-label="discover">
      {TABS.map((t) => (
        <a key={t.id} className={"tab" + (t.id === current ? " cur" : "")} href={t.href} aria-current={t.id === current ? "page" : undefined}>{t.label}</a>
      ))}
    </nav>
  );
}
