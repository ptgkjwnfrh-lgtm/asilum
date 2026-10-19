// app/watchtower/page.js — demand, in cohorts. Replaces DISCOVER for a
// business account (lib/nav.js).
//
// The question it answers: how many readers of this catalog already buy
// clothes like the ones you sell? That is a tag-space question — the business's
// pieces have a tag vector, readers have a taste vector, and the overlap is
// the answer. It is deliberately a COHORT answer: counts and bands, never a
// person.

import KindGate from "../components/KindGate.jsx";

export const metadata = { title: "WATCH TOWER" }; // the layout appends the suffix

export default function WatchTowerPage() {
  return (
    <KindGate capability="watchtower">
      <main className="wrap">
        <div className="psub">DEMAND // COHORTS</div>
        <h1>*WATCH TOWER</h1>
        <p className="deck">
          how many readers already wear what you sell. your pieces carry tags;
          readers carry a taste vector; this is the overlap between them.
        </p>
        <section className="ledgercell">
          <h2>MATCHED READERS</h2>
          <p>
            counts and bands only. the tower reports how many, how close, and
            what they are missing — never who. a cohort below the anonymity
            floor is reported as below the floor, not rounded to zero and not
            shown.
          </p>
          <span className="soon">NOT WIRED YET</span>
        </section>
      </main>
    </KindGate>
  );
}
