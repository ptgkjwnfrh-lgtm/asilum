"use client";

// app/components/OverviewSheet.jsx — an entity overview opened INSIDE the
// one sheet (Back returns to the search with its query). The record and
// its evidence are PersonOverview's — the sourced facts, the source rows,
// the last-updated date and the correction path — rendered whole here
// rather than compressed as the preview does.

import EntityOverview from "./EntityOverview.jsx";
import { pushSheet } from "../../lib/dockstate.js";

export default function OverviewSheet({ person, entity }) {
  const e = entity || person;
  if (!e) return <p className="pempty">no overview.</p>;
  // a chip opens the linked entity INSIDE the sheet; Back returns here
  return (
    <div className="ovsheet">
      <EntityOverview entity={e} onOpen={(next) => pushSheet("overview", { entity: next, title: next.name.toUpperCase() })} />
    </div>
  );
}
