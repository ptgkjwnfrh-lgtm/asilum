// app/terms/page.js — TERMS OF SERVICE.
// Constitution §7 launch dependency. Describes the product as it actually
// is: a discovery magazine with external checkout — ASiLUM is never the
// seller. Version 1.0 — drafted 2026-07-19; counsel review pending
// (governing-law venue is a flagged counsel decision).

export const metadata = {
  title: "*ASILUM magazine — terms of service",
  description: "The agreement for using ASiLUM magazine.",
};

export default function TermsPage() {
  return (
    <div className="wrap">
      <div className="locline"><a href="/settings">← SETTINGS</a><span>/ THE FINE PRINT</span></div>
      <h1 className="headline"><span className="red">*</span>TERMS OF SERVICE</h1>
      <p className="deck">
        the agreement for using ASiLUM magazine. version 1.1 — effective
        august 20, 2026 (adds the founders fee and purchase-info storage;
        under legal review).
      </p>

      <h2 className="statshead">THE SERVICE</h2>
      <p className="legal">
        ASiLUM magazine is a fashion discovery service: an editorial magazine,
        a product catalog, a personal taste engine named Asterisk, a stylist,
        and private tools like moodboards and a wardrobe. by using
        asilummagazine.com you agree to these terms and to the{" "}
        <a href="/privacy">privacy policy</a>. if you do not agree, do not use
        the service.
      </p>

      <h2 className="statshead">YOUR ACCOUNT AND DEVICE IDENTITY</h2>
      <p className="legal">
        the service works without an account through a pseudonymous device
        identity. if you create an account, keep access to your email secure —
        magic-link sign-in is only as safe as your inbox. you are responsible
        for activity under your identity. one person per account; no
        impersonation.
      </p>

      <h2 className="statshead">SHOPPING HAPPENS ELSEWHERE</h2>
      <p className="legal">
        ASiLUM is a discovery and routing service, not a store. product
        listings name their source, and the purchase of a piece — its price,
        shipping, and tax — happens on the source merchant&apos;s own site
        under that merchant&apos;s terms. ASiLUM is not the seller of listed
        pieces and is not a party to that purchase. listings can go stale
        between our checks; price, availability, and condition are the
        merchant&apos;s to confirm. purchase tickets open under the
        disclaimer shown when you create one — they are not an order,
        escrow, or guarantee of the merchant&apos;s sale.
      </p>

      <h2 className="statshead">THE FOUNDERS FEE</h2>
      <p className="legal">
        opening a purchase ticket carries ASiLUM&apos;s founders fee: 1% of
        the listed piece price, with a $0.50 minimum, charged by ASiLUM as
        its own transaction — your card statement will show two lines, ASiLUM
        (the fee) and the merchant (the piece). the fee and the total are
        itemized on the checkout screen before you pay, and nothing is
        charged without your consent to the ticket disclaimer. the fee buys
        the ticket: the verified source link, an availability check when it
        opens, and our support channel — it is not a payment for the piece.
        if the listed piece turns out to be unavailable when you follow
        through, contact support and the fee is refunded.
      </p>

      <h2 className="statshead">PURCHASE INFO, STORED ONCE</h2>
      <p className="legal">
        if you buy, the name and address you enter are stored once, in a
        purchase-info vault kept apart from the catalog and your taste
        record, so checkout never asks twice. your card is held by our
        payment processor, Stripe — ASiLUM keeps only a reference and the
        last four digits, never a card number. you can edit these details,
        remove the saved card, or erase everything in{" "}
        <a href="/settings">Settings → PURCHASE INFO</a>; the privacy
        delete erases the vault as well. order and ticket ledgers are
        retained as transaction records.
      </p>

      <h2 className="statshead">YOUR CONTENT</h2>
      <p className="legal">
        content you add — moodboards, wardrobe entries, garment photos, posts
        — remains yours. you grant ASiLUM a non-exclusive license to host and
        process it solely to operate the service for you, ending when you
        delete the content. you promise you have the rights to what you
        upload. we may remove content that is unlawful or breaks these terms.
      </p>

      <h2 className="statshead">ACCEPTABLE USE</h2>
      <p className="legal">
        do not: scrape or bulk-harvest the service; probe, overload, or
        circumvent its security and rate limits; upload unlawful content or
        content you lack rights to; misrepresent who you are; use the service
        to build a competing dataset; or interfere with other people&apos;s
        use. we enforce this with rate limits, security filtering, and — when
        necessary — suspension.
      </p>

      <h2 className="statshead">THE ASTERISK SYSTEM IS AUTOMATED</h2>
      <p className="legal">
        recommendations, readings, and stylist output are produced by an
        automated system built on deterministic taste arithmetic and a
        human-curated, source-cited culture catalog. it explains itself and
        accepts corrections, but it can be wrong, and its output is editorial
        guidance — not professional, commercial, or authentication advice.
        you can pause or erase personalization at any time from{" "}
        <a href="/settings">Settings</a> and the{" "}
        <a href="/asterisk">Asterisk control room</a>.
      </p>

      <h2 className="statshead">INTELLECTUAL PROPERTY</h2>
      <p className="legal">
        the ASiLUM name, design, and original editorial content belong to
        ASiLUM. our editorial summaries are original writing that links to
        publications rather than reproducing them. product names, images, and
        trademarks belong to their owners; their appearance here is
        identification, not endorsement or partnership.
      </p>

      <h2 className="statshead">DISCLAIMERS AND LIABILITY</h2>
      <p className="legal">
        the service is provided &quot;as is&quot; and &quot;as
        available&quot;, without warranties of any kind, express or implied,
        including merchantability, fitness for a particular purpose, and
        non-infringement. to the fullest extent the law allows, ASiLUM is not
        liable for indirect, incidental, special, consequential, or punitive
        damages, or for loss of profits, data, or goodwill, arising from your
        use of the service or any third-party listing or merchant; our total
        liability for any claim is limited to one hundred us dollars
        (usd&nbsp;$100) or the amount you paid us in the past twelve months,
        whichever is greater. some jurisdictions limit these exclusions, so
        parts may not apply to you.
      </p>

      <h2 className="statshead">TERMINATION</h2>
      <p className="legal">
        you can stop using the service and delete your data at any time. we
        may suspend or terminate access that breaks these terms or threatens
        the service or its users, with notice where practicable. sections
        that by their nature survive — your content license until deletion,
        disclaimers, liability limits — survive termination.
      </p>

      <h2 className="statshead">GOVERNING LAW AND CHANGES</h2>
      <p className="legal">
        these terms are governed by the laws of the united states and the
        state of new york, without regard to conflict-of-law rules (venue
        subject to confirmation in the final legal review). we will post
        material changes here with a new version number and effective date;
        continued use after the effective date means the new version applies.
        questions:{" "}
        <a href="mailto:legal@asilummagazine.com">legal@asilummagazine.com</a>.
        if any part of these terms is found unenforceable, the rest stands.
      </p>
    </div>
  );
}
