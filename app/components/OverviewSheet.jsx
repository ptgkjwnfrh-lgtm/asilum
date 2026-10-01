"use client";

// app/components/OverviewSheet.jsx — an entity overview opened INSIDE the
// one sheet (Back returns to the search with its query). The record and
// its evidence are PersonOverview's — the sourced facts, the source rows,
// the last-updated date and the correction path — rendered whole here
// rather than compressed as the preview does.

import PersonOverview from "./PersonOverview.jsx";

export default function OverviewSheet({ person }) {
  if (!person) return <p className="pempty">no overview.</p>;
  return (
    <div className="ovsheet">
      <PersonOverview person={person} />
    </div>
  );
}
