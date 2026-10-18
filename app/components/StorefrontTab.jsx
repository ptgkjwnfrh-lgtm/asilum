"use client";

// ONE STOREFRONT, inside PROFILE.
//
// This component is deliberately only a client for the existing storefront
// API. It does not calculate fees, settle money, reserve stock, duplicate the
// bag, or invent a second product-detail surface. The server owns every
// capability and amount shown here; a missing capability is an honest OFF.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authorizedFetch, getUid, sendJSON, thumbFor } from "../../lib/client.js";
import { STOREFRONT_CATEGORIES, STOREFRONT_TERMS_VERSION } from "../../lib/storefront/contracts.js";
import Notice from "./Notice.jsx";
import { FollowButton } from "./UserBits.jsx";

const CATEGORY_FIELDS = Object.freeze({
  clothing: [
    { key: "size", label: "TAGGED SIZE", placeholder: "M, IT 48, 32 × 30…" },
    { key: "fit", label: "SELLER-STATED FIT", placeholder: "slim, relaxed, oversized…" },
    { key: "silhouette", label: "SILHOUETTE", placeholder: "straight leg, cropped, A-line…" },
    { key: "material", label: "MATERIAL", placeholder: "wool, cotton, leather…" },
    { key: "color", label: "SELLER-STATED COLOR", placeholder: "black, oxblood, ecru…" },
  ],
  jewelry: [
    { key: "dimensions", label: "DIMENSIONS / SIZE", placeholder: "18 in chain; 16 mm face" },
    { key: "material", label: "SELLER-STATED MATERIAL", placeholder: "sterling silver claim, resin…" },
    { key: "ring_size", label: "RING SIZE", placeholder: "US 7, EU 54…" },
    { key: "stone", label: "SELLER-STATED STONE", placeholder: "onyx, glass, unknown…" },
    { key: "color", label: "SELLER-STATED COLOR", placeholder: "silver, amber…" },
  ],
  posters_prints: [
    { key: "dimensions", label: "DIMENSIONS + UNITS", placeholder: "18 × 24 in" },
    { key: "medium", label: "MEDIUM", placeholder: "screen print, offset lithograph…" },
    { key: "edition", label: "EDITION", placeholder: "12/100, open edition…" },
    { key: "framed", label: "FRAME", placeholder: "unframed, walnut frame…" },
  ],
  furniture: [
    { key: "dimensions", label: "DIMENSIONS + UNITS", placeholder: "80 × 54 × 72 cm" },
    { key: "material", label: "MATERIAL", placeholder: "chrome and leather…" },
    { key: "weight", label: "WEIGHT + UNITS", placeholder: "24 kg…" },
    { key: "assembly", label: "ASSEMBLY", placeholder: "ships assembled; legs detach…" },
    { key: "color", label: "SELLER-STATED COLOR", placeholder: "walnut, chrome…" },
  ],
  electronics_tech: [
    { key: "model", label: "MAKE / MODEL", placeholder: "Sony DCR-TRV900" },
    { key: "specifications", label: "SPECIFICATIONS", placeholder: "format, voltage, storage…" },
    { key: "compatibility", label: "COMPATIBILITY", placeholder: "tested with…; requires…" },
    { key: "power", label: "POWER", placeholder: "120 V; battery included…" },
    { key: "condition", label: "TESTED CONDITION", placeholder: "tested functions and known faults" },
  ],
  ornaments_home: [
    { key: "dimensions", label: "DIMENSIONS + UNITS", placeholder: "24 × 12 cm" },
    { key: "material", label: "MEDIUM / MATERIAL", placeholder: "ceramic, glass, wood…" },
    { key: "weight", label: "WEIGHT + UNITS", placeholder: "1.2 kg…" },
    { key: "color", label: "SELLER-STATED COLOR", placeholder: "smoke glass, cobalt…" },
  ],
  other: [
    { key: "dimensions", label: "DIMENSIONS + UNITS", placeholder: "only where relevant" },
    { key: "material", label: "MATERIAL / MEDIUM", placeholder: "seller-stated facts only" },
    { key: "specifications", label: "OTHER RELEVANT FACTS", placeholder: "facts a buyer needs; unknown stays blank" },
    { key: "color", label: "SELLER-STATED COLOR", placeholder: "only where relevant" },
  ],
});

const EMPTY_CREATE = { name: "", description: "", bannerUrl: "", accepted: false };
const EMPTY_LISTING = {
  title: "", description: "", category: "clothing", subcategory: "", condition: "",
  price: "", currency: "USD", quantity: "1", variantLabel: "Default", sku: "",
  photos: "", shipping: true, pickup: false, attributes: {},
};

const pick = (object, ...keys) => {
  for (const key of keys) if (object && object[key] !== undefined && object[key] !== null) return object[key];
  return null;
};

function normalizeEnvelope(raw = {}) {
  const storefront = raw.storefront || null;
  const feeEntries = Array.isArray(raw.feeEvents) ? raw.feeEvents : [];
  const fee = raw.fee || (raw.feeBalance
    ? { ...raw.feeBalance, entries: feeEntries }
    : null);
  return {
    storefront,
    listings: Array.isArray(raw.listings)
      ? raw.listings : Array.isArray(storefront?.listings) ? storefront.listings : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    fee,
    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : {},
    termsVersion: raw.termsVersion || raw.currentTermsVersion
      || raw.capabilities?.termsVersion || STOREFRONT_TERMS_VERSION,
  };
}

function reasonText(capabilities) {
  const reasons = Array.isArray(capabilities?.reasons) ? capabilities.reasons : [];
  return reasons.map((reason) => typeof reason === "string" ? reason : reason?.message).filter(Boolean);
}

function formatMoney(cents, currency = "USD") {
  if (cents === null || cents === undefined || cents === "") return "—";
  const value = Number(cents);
  if (!Number.isInteger(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: String(currency || "USD").toUpperCase(),
    }).format(value / 100);
  } catch {
    return `${String(currency || "USD").toUpperCase()} ${(value / 100).toFixed(2)}`;
  }
}

function decimalToMinor(value) {
  const match = String(value || "").trim().match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || "").padEnd(2, "0") || 0);
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

function minorToDecimal(value) {
  return Number.isInteger(Number(value)) ? (Number(value) / 100).toFixed(2) : "";
}

function listingId(listing) {
  return String(listing?.id || listing?.itemId || listing?.item_id || "");
}

function catalogItemId(listing) {
  return String(listing?.itemId || listing?.item_id || listing?.id || "");
}

function listingStatus(listing) {
  return String(listing?.status || listing?.state || listing?.publicationState || listing?.publication_state || "draft");
}

function listingPriceCents(listing) {
  const value = pick(listing, "priceCents", "price_cents")
    ?? pick(listing?.variants?.[0], "priceCents", "price_cents");
  return value === null || value === undefined ? null : Number(value);
}

function listingPhoto(listing) {
  const first = Array.isArray(listing?.photos) ? listing.photos[0] : null;
  return typeof first === "string" ? first
    : first?.url || listing?.imageUrl || listing?.image_url || listing?.img || "";
}

function listingQuantity(listing) {
  const variant = Array.isArray(listing?.variants) ? listing.variants[0] : null;
  return pick(variant, "availableQuantity", "available_quantity", "stockOnHand", "stock_on_hand")
    ?? pick(listing, "availableQuantity", "available_quantity", "inventory", "quantity") ?? 0;
}

function listingToDraft(listing) {
  const variant = Array.isArray(listing?.variants) ? listing.variants[0] : null;
  const fulfillment = listing?.fulfillment || {};
  return {
    title: listing?.title || "",
    description: listing?.description || "",
    category: listing?.category || "other",
    subcategory: listing?.subcategory || "",
    condition: listing?.condition || "",
    price: minorToDecimal(listingPriceCents(listing)),
    currency: String(listing?.currency || "USD").toUpperCase(),
    quantity: String(pick(variant, "stockOnHand", "stock_on_hand") ?? listingQuantity(listing)),
    variantLabel: variant?.label || "Default",
    sku: variant?.sku || "",
    photos: (Array.isArray(listing?.photos) ? listing.photos : [])
      .map((photo) => typeof photo === "string" ? photo : photo?.url).filter(Boolean).join("\n"),
    shipping: fulfillment.shipping === true,
    pickup: fulfillment.pickup === true,
    attributes: listing?.attributes && typeof listing.attributes === "object" ? { ...listing.attributes } : {},
  };
}

function checkoutState(capabilities = {}, storefront = null) {
  const mode = String(capabilities.checkoutMode || capabilities.checkout_mode || "off").toLowerCase();
  const enabled = capabilities.canReceiveOrders === true && (mode === "test" || mode === "live");
  if (enabled && mode === "test") return {
    tone: "test", title: "TEST CHECKOUT ONLY",
    note: "The server reports test-mode order intake. No live-money readiness is implied.",
  };
  if (enabled && mode === "live") return {
    tone: "ready", title: "ORDER INTAKE ENABLED",
    note: "The server reports this storefront as eligible to receive orders.",
  };
  const onboarding = capabilities.paymentOnboarding || capabilities.payment_onboarding
    || storefront?.paymentOnboarding || "not_started";
  return {
    tone: "off", title: "ORDER INTAKE OFF",
    note: onboarding === "pending"
      ? "Payment onboarding is pending. Drafts and store editing remain available."
      : onboarding === "restricted"
        ? "The payment provider reports a restriction. Drafts remain available; orders do not."
        : "Native checkout has not been verified for this store. Draft management remains available.",
  };
}

function CheckoutStatus({ capabilities, storefront, compact = false }) {
  const state = checkoutState(capabilities, storefront);
  const reasons = reasonText(capabilities);
  return (
    <div className={`sfreadiness ${state.tone}${compact ? " compact" : ""}`} role="status">
      <b>{state.title}</b>
      <span>{state.note}</span>
      {!compact && reasons.length > 0 ? (
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      ) : null}
    </div>
  );
}

function StoreIdentity({ storefront, heading = "h2" }) {
  const Heading = heading;
  const banner = storefront?.bannerUrl || storefront?.banner_url
    || storefront?.imageUrl || storefront?.image_url;
  return (
    <header className="sfidentity">
      {banner ? (
        <img className="sfbanner" src={banner} alt="" />
      ) : <div className="sfbanner sfblank" aria-hidden="true"><span>*</span></div>}
      <div className="sfidentitybody">
        <span className="sfeyebrow">NATIVE STOREFRONT</span>
        <Heading>{storefront?.name || "Untitled store"}<span className="red">.</span></Heading>
        {storefront?.description ? <p>{storefront.description}</p> : <p className="fine">No public description yet.</p>}
        <div className="sfmeta">
          <span>{String(storefront?.status || storefront?.state || "draft").replaceAll("_", " ").toUpperCase()}</span>
          {storefront?.slug ? <span>/{storefront.slug}</span> : null}
        </div>
      </div>
    </header>
  );
}

function PublicListingCard({ listing }) {
  const id = catalogItemId(listing);
  const photo = listingPhoto(listing);
  const cents = listingPriceCents(listing);
  const quantity = Number(listingQuantity(listing));
  return (
    <article className="sfproduct">
      <a className="sfproductlink" href={`/?item=${encodeURIComponent(id)}`}>
        <div className="sfproductimage" aria-hidden="true">
          <img src={photo || thumbFor({ ...listing, id })} alt="" loading="lazy" />
        </div>
        <div className="sfproductbody">
          <span className="sfeyebrow">{String(listing.category || "object").replaceAll("_", " ")}</span>
          <h3>{listing.title || "Untitled listing"}</h3>
          {listing.condition ? <span className="fine">{String(listing.condition).replaceAll("_", " ")}</span> : null}
          <div className="sfproductfoot">
            <b>{formatMoney(cents, listing.currency)}</b>
            <span>{quantity > 0 ? `${quantity} AVAILABLE` : "SOLD OUT"}</span>
          </div>
        </div>
      </a>
    </article>
  );
}

function PublicStorefrontActions({ storefront }) {
  const handle = String(storefront?.sellerHandle || storefront?.seller_handle || "").trim().toLowerCase();
  const [note, setNote] = useState("");
  if (!handle) return null;

  function messageSeller() {
    if (!String(getUid() || "").startsWith("sb-")) {
      setNote("sign in through ACCOUNT to message this seller");
      return;
    }
    window.dispatchEvent(new CustomEvent("asilum:dm-open", { detail: { handle } }));
    setNote("the mail desk is open to this seller");
  }

  async function shareStore() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: storefront.name || "ASILUM storefront", url });
      else await navigator.clipboard.writeText(url);
      setNote(navigator.share ? "storefront shared" : "storefront link copied");
    } catch (error) {
      if (error?.name !== "AbortError") setNote("the storefront link could not be shared");
    }
  }

  async function reportStore() {
    if (!String(getUid() || "").startsWith("sb-")) {
      setNote("sign in through ACCOUNT to report this storefront");
      return;
    }
    try {
      const response = await sendJSON("POST", "/api/profile/room", {
        user: getUid(), op: "report", handle, reason: `storefront /${storefront.slug || ""}`,
      });
      const body = await response.json().catch(() => ({}));
      setNote(response.ok ? "reported — a human will look" : body.error || "the report could not be sent");
    } catch {
      setNote("the report could not be sent");
    }
  }

  return (
    <div className="sfpublicactions" aria-label="storefront social and safety actions">
      <a className="btn ghost" href={`/u/${encodeURIComponent(handle)}`}>PASSPORT</a>
      <FollowButton handle={handle} />
      <button className="btn ghost" type="button" onClick={messageSeller}>MESSAGE</button>
      <button className="btn ghost" type="button" onClick={shareStore}>SHARE</button>
      <button className="txtbtn" type="button" onClick={reportStore}>REPORT</button>
      {note ? <span className="fine" role="status" aria-live="polite">{note}</span> : null}
    </div>
  );
}

function PublicStorefrontBody({ storefront, listings, capabilities, heading = "h2", preview = false }) {
  const visible = listings.filter((listing) => listingStatus(listing) === "active");
  return (
    <section className="sfpublic" aria-label={preview ? "public storefront preview" : "public storefront"}>
      {preview ? <div className="sfpreviewlabel">PUBLIC PREVIEW · DRAFTS AND PRIVATE MONEY DATA ARE HIDDEN</div> : null}
      <StoreIdentity storefront={storefront} heading={heading} />
      {!preview ? <PublicStorefrontActions storefront={storefront} /> : null}
      <CheckoutStatus capabilities={capabilities} storefront={storefront} compact />
      {visible.length ? (
        <div className="sfproductgrid">{visible.map((listing) => (
          <PublicListingCard key={listingId(listing)} listing={listing} />
        ))}</div>
      ) : (
        <div className="empty">no active listings are public right now.</div>
      )}
    </section>
  );
}

function CreateStore({ termsVersion, canCreate, reasons, busy, onCreate }) {
  const [form, setForm] = useState(EMPTY_CREATE);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) { setError("name your store first"); return; }
    if (!form.accepted) { setError("accept the current storefront terms to save this draft"); return; }
    setError("");
    onCreate({
      action: "create_store", name, description: form.description.trim(),
      bannerUrl: form.bannerUrl.trim() || null,
      acceptedTermsVersion: termsVersion, accepted: true,
    });
  }

  return (
    <section className="sfcreate">
      <div className="sfintro">
        <span className="sfeyebrow">ONE STORE · INSIDE ASILUM</span>
        <h2>Open your store free<span className="red">.</span></h2>
        <p>
          ASILUM collects $30 from your sales proceeds, starting with your first sale.
          If needed, collection continues across later sales. No ASILUM sales commission.
          Payment processing applies.
        </p>
        <ul className="sfplainlist">
          <li>no storefront tiers or subscription</li>
          <li>no separate website or Shopify site required</li>
          <li>nothing is charged to create the draft</li>
        </ul>
      </div>
      <form className="sfform" onSubmit={submit}>
        <label><span>STORE NAME</span>
          <input type="text" maxLength={100} value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label><span>PUBLIC DESCRIPTION (optional)</span>
          <textarea rows={4} maxLength={1000} value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label><span>BRAND IMAGE / BANNER HTTPS ADDRESS (optional)</span>
          <input type="url" maxLength={2048} placeholder="https://…" value={form.bannerUrl}
            onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} />
        </label>
        <p className="fine">Direct photo uploads appear only when the storage service reports them available. A draft does not require an image.</p>
        <label className="sfcheck">
          <input type="checkbox" checked={form.accepted}
            onChange={(event) => setForm({ ...form, accepted: event.target.checked })} />
          <span>I accept <a href="/terms#storefront-terms" target="_blank" rel="noopener noreferrer">storefront terms</a> <b>{termsVersion}</b>. This creates a free draft; it does not enable payment acceptance.</span>
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!canCreate && reasons.length ? <Notice tone="error">{reasons.join(" ")}</Notice> : null}
        <button className="btn" type="submit" disabled={!canCreate || !!busy}>
          {busy ? "SAVING…" : "CREATE STORE DRAFT"}
        </button>
      </form>
    </section>
  );
}

function ListingEditor({ listing, canManage, busy, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => listing ? listingToDraft(listing) : { ...EMPTY_LISTING });
  const [error, setError] = useState("");
  // Keep one key across a lost response/manual retry. ProductsPanel remounts
  // the blank editor only after a successful create, producing the next key
  // when the seller truly starts another listing.
  const createOperationKey = useRef(globalThis.crypto?.randomUUID?.()
    || `listing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const categoryFields = CATEGORY_FIELDS[draft.category] || CATEGORY_FIELDS.other;

  useEffect(() => {
    setDraft(listing ? listingToDraft(listing) : { ...EMPTY_LISTING });
    setError("");
  }, [listing]);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setAttribute(key, value) {
    setDraft((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
  }

  function submit(event) {
    event.preventDefault();
    const priceCents = decimalToMinor(draft.price);
    const quantity = Number(draft.quantity);
    if (!draft.title.trim()) { setError("a listing needs a title"); return; }
    if (!STOREFRONT_CATEGORIES.some((category) => category.id === draft.category)) {
      setError("choose a supported category"); return;
    }
    if (!Number.isInteger(priceCents) || priceCents <= 0) { setError("enter a price with no more than two decimal places"); return; }
    if (!Number.isInteger(quantity) || quantity < 0) { setError("inventory must be a whole number, zero or higher"); return; }
    const photos = draft.photos.split(/\n|,/).map((value) => value.trim()).filter(Boolean);
    if (photos.some((url) => !/^https:\/\//i.test(url))) { setError("every photo address must begin with https://"); return; }
    setError("");
    const existingVariant = listing?.variants?.[0] || null;
    const cleanAttributes = Object.fromEntries(Object.entries(draft.attributes || {})
      .map(([key, value]) => [key, String(value || "").trim()]).filter(([, value]) => value));
    onSave({
      action: listing ? "update_listing" : "create_listing",
      ...(listing ? { listingId: listingId(listing), version: listing.version } : {}),
      ...(!listing ? { operationKey: createOperationKey.current } : {}),
      title: draft.title.trim(), description: draft.description.trim(),
      category: draft.category, subcategory: draft.subcategory.trim() || null,
      condition: draft.condition || null, currency: draft.currency.toUpperCase(), priceCents,
      photos, attributes: cleanAttributes,
      fulfillment: { shipping: draft.shipping, pickup: draft.pickup }, inventory: quantity,
      variants: [{
        ...(existingVariant?.id ? { id: existingVariant.id, version: existingVariant.version } : {}),
        label: draft.variantLabel.trim() || "Default", sku: draft.sku.trim() || null,
        optionValues: {}, priceCents, stockOnHand: quantity,
      }],
    });
  }

  return (
    <form className="sfform sflistingform" onSubmit={submit}>
      <div className="sfsectionhead">
        <div><span className="sfeyebrow">{listing ? "EDIT LISTING" : "NEW LISTING"}</span>
          <h3>{listing ? listing.title : "A real catalog record"}</h3></div>
        {listing ? <button className="txtbtn" type="button" onClick={onCancel}>CANCEL EDIT</button> : null}
      </div>
      <div className="sfformgrid">
        <label><span>TITLE</span><input type="text" maxLength={300} value={draft.title}
          onChange={(event) => setField("title", event.target.value)} /></label>
        <label><span>CATEGORY</span><select value={draft.category}
          onChange={(event) => setField("category", event.target.value)}>
          {STOREFRONT_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label.toUpperCase()}</option>)}
        </select></label>
        <label><span>SUBCATEGORY (optional)</span><input type="text" maxLength={80} value={draft.subcategory}
          onChange={(event) => setField("subcategory", event.target.value)} /></label>
        <label><span>CONDITION</span><select value={draft.condition}
          onChange={(event) => setField("condition", event.target.value)}>
          <option value="">unknown / not stated</option><option value="new">new</option>
          <option value="used_like_new">used · like new</option><option value="used_good">used · good</option>
          <option value="used_fair">used · fair</option><option value="refurbished">refurbished</option>
          <option value="for_parts">for parts / repair</option>
        </select></label>
        <label className="sfwide"><span>DESCRIPTION</span><textarea rows={4} maxLength={4000} value={draft.description}
          onChange={(event) => setField("description", event.target.value)} /></label>
        <label><span>PRICE</span><input type="text" inputMode="decimal" placeholder="0.00" value={draft.price}
          onChange={(event) => setField("price", event.target.value)} /></label>
        <label><span>CURRENCY</span><input type="text" maxLength={3} value={draft.currency}
          onChange={(event) => setField("currency", event.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase())} /></label>
        <label><span>INVENTORY</span><input type="number" min="0" step="1" value={draft.quantity}
          onChange={(event) => setField("quantity", event.target.value)} /></label>
        <label><span>VARIANT LABEL</span><input type="text" maxLength={100} placeholder="Default, Size M, Walnut…" value={draft.variantLabel}
          onChange={(event) => setField("variantLabel", event.target.value)} /></label>
        <label><span>SKU (optional)</span><input type="text" maxLength={100} value={draft.sku}
          onChange={(event) => setField("sku", event.target.value)} /></label>
        {categoryFields.map((field) => (
          <label key={field.key}><span>{field.label}</span><input type="text" maxLength={500}
            placeholder={field.placeholder} value={draft.attributes[field.key] || ""}
            onChange={(event) => setAttribute(field.key, event.target.value)} /></label>
        ))}
        <label className="sfwide"><span>PHOTO HTTPS ADDRESSES (one per line)</span><textarea rows={3} maxLength={8000}
          placeholder="https://…" value={draft.photos} onChange={(event) => setField("photos", event.target.value)} /></label>
      </div>
      <fieldset className="sffulfillment">
        <legend>FULFILLMENT OFFERED</legend>
        <label className="sfcheck"><input type="checkbox" checked={draft.shipping}
          onChange={(event) => setField("shipping", event.target.checked)} /><span>shipping</span></label>
        <label className="sfcheck"><input type="checkbox" checked={draft.pickup}
          onChange={(event) => setField("pickup", event.target.checked)} /><span>supported pickup</span></label>
      </fieldset>
      <p className="fine">Unknown facts stay blank. Seller statements are not ASILUM verification. Private pickup addresses never enter the public listing.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <button className="btn" type="submit" disabled={!canManage || !!busy}>
        {busy ? "SAVING…" : listing ? "SAVE CHANGES" : "SAVE DRAFT LISTING"}
      </button>
    </form>
  );
}

function ProductsPanel({ listings, capabilities, busy, mutate }) {
  const [editing, setEditing] = useState(null);
  const [createEpoch, setCreateEpoch] = useState(0);
  const canManage = capabilities.canManageListings !== false;
  const reasons = reasonText(capabilities);

  async function save(payload) {
    const ok = await mutate(payload, payload.action === "create_listing" ? "listing draft saved" : "listing updated");
    if (ok) {
      setEditing(null);
      if (payload.action === "create_listing") setCreateEpoch((value) => value + 1);
    }
    return ok;
  }

  return (
    <div className="sfmanagegrid">
      <ListingEditor key={editing ? `edit-${listingId(editing)}` : `new-${createEpoch}`}
        listing={editing} canManage={canManage} busy={busy} onCancel={() => setEditing(null)} onSave={save} />
      <section className="sflist" aria-label="your listings">
        <div className="sfsectionhead"><div><span className="sfeyebrow">INVENTORY</span><h3>{listings.length} LISTING{listings.length === 1 ? "" : "S"}</h3></div></div>
        {!canManage && reasons.length ? <Notice tone="error">{reasons.join(" ")}</Notice> : null}
        {!listings.length ? <div className="empty">no listings yet — save the first draft beside this ledger.</div> : null}
        {listings.map((listing) => {
          const id = listingId(listing);
          const status = listingStatus(listing);
          const reviewPending = status === "pending_review";
          const publishLabel = status === "active" ? "PAUSE" : reviewPending ? "REVIEW REQUESTED" : "REQUEST REVIEW";
          const nextStatus = status === "active" ? "paused" : "pending_review";
          return (
            <article className="sflistingrow" key={id}>
              <img src={listingPhoto(listing) || thumbFor({ ...listing, id })} alt="" />
              <div><b>{listing.title || "Untitled listing"}</b>
                <span>{String(listing.category || "other").replaceAll("_", " ")} · {formatMoney(listingPriceCents(listing), listing.currency)}</span>
                <span>{status.replaceAll("_", " ")} · {listingQuantity(listing)} available</span></div>
              <div className="sfrowactions">
                <button className="txtbtn" type="button" onClick={() => setEditing(listing)} disabled={!!busy}>EDIT</button>
                <button className="txtbtn" type="button" disabled={!!busy || reviewPending}
                  title={reviewPending ? "moderation and payment readiness must finish before publication" : ""}
                  onClick={() => mutate({ action: "update_listing", listingId: id, version: listing.version, status: nextStatus },
                    nextStatus === "pending_review" ? "review requested" : "listing paused")}>{publishLabel}</button>
                {status !== "archived" ? <button className="txtbtn danger" type="button" disabled={!!busy}
                  onClick={() => mutate({ action: "archive_listing", listingId: id, version: listing.version }, "listing archived")}>ARCHIVE</button> : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function OrdersPanel({ orders, capabilities, storefront }) {
  const readiness = checkoutState(capabilities, storefront);
  return (
    <section className="sfledger">
      <div className="sfsectionhead"><div><span className="sfeyebrow">SELLER ORDERS</span><h3>ORDER RECORD</h3></div></div>
      <CheckoutStatus capabilities={capabilities} storefront={storefront} />
      {!orders.length ? <div className="empty">no native orders on record.</div> : (
        <div className="sforderlist">{orders.map((order) => (
          <article className="sforder" key={order.id}>
            <div><b>{order.title || order.listingTitle || `ORDER ${String(order.id).slice(0, 10)}`}</b>
              <span>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "date unavailable"}</span></div>
            <div><span className="sfstate">{String(order.status || "unknown").replaceAll("_", " ")}</span>
              <b>{formatMoney(pick(order, "totalCents", "total_cents", "amountCents", "amount_cents"), order.currency)}</b></div>
          </article>
        ))}</div>
      )}
      <p className="fine">
        {readiness.tone === "off"
          ? "Shipping, tracking, cancellation and refund actions stay absent until the server exposes supported order operations."
          : "Order state comes from the server ledger. Provider confirmation, not this screen, decides payment success."}
      </p>
    </section>
  );
}

function EarningsPanel({ fee, orders }) {
  const currency = fee?.currency || "USD";
  const entries = Array.isArray(fee?.entries) ? fee.entries : Array.isArray(fee?.ledger) ? fee.ledger : [];
  return (
    <section className="sfledger">
      <div className="sfsectionhead"><div><span className="sfeyebrow">STORE OPENING BALANCE</span><h3>$30 COLLECTION LEDGER</h3></div></div>
      {fee ? (
        <>
          <div className="sffeecards">
            <div><span>TOTAL</span><b>{formatMoney(pick(fee, "targetCents", "target_cents"), currency)}</b></div>
            <div><span>COLLECTED</span><b>{formatMoney(pick(fee, "collectedCents", "collected_cents"), currency)}</b></div>
            <div><span>RESERVED · NOT RECEIVED</span><b>{formatMoney(pick(fee, "reservedCents", "reserved_cents"), currency)}</b></div>
            <div><span>STILL UNPAID</span><b>{formatMoney(pick(fee, "remainingCents", "remaining_cents", "outstandingCents", "outstanding_cents"), currency)}</b></div>
          </div>
          <p className="fine">Reservations are not collected money. Every amount above is returned by the fee ledger; this page does not recompute it.</p>
          {entries.length ? <div className="sforderlist">{entries.map((entry, index) => (
            <article className="sforder" key={entry.id || entry.operationKey || index}>
              <div><b>{String(entry.kind || entry.type || "ledger event").replaceAll("_", " ")}</b>
                <span>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}</span></div>
              <div><span className="sfstate">{String(entry.status || "recorded").replaceAll("_", " ")}</span>
                <b>{formatMoney(pick(entry, "amountCents", "amount_cents"), currency)}</b></div>
            </article>
          ))}</div> : <div className="empty">no fee collection events yet.</div>}
        </>
      ) : <Notice tone="error">the fee ledger is unavailable — no balance is inferred.</Notice>}
      <div className="sfmetric"><span>ORDERS RETURNED BY THE LEDGER</span><b>{orders.length}</b></div>
    </section>
  );
}

function DetailsPanel({ storefront, capabilities, busy, mutate }) {
  const [form, setForm] = useState({ name: "", description: "", bannerUrl: "", status: "draft" });
  useEffect(() => setForm({
    name: storefront?.name || "", description: storefront?.description || "",
    bannerUrl: storefront?.bannerUrl || storefront?.banner_url || "",
    status: storefront?.status || storefront?.state || "draft",
  }), [storefront]);
  const canEdit = capabilities.canEditStore !== false;

  function submit(event) {
    event.preventDefault();
    mutate({
      action: "update_store", version: storefront.version,
      name: form.name.trim(), description: form.description.trim(),
      bannerUrl: form.bannerUrl.trim() || null, status: form.status,
    }, "store details updated");
  }

  return (
    <section className="sfdetails">
      <div className="sfsectionhead"><div><span className="sfeyebrow">STORE DETAILS</span><h3>PUBLIC RECORD</h3></div>
        {storefront.slug ? <a className="txtbtn" href={`/store/${encodeURIComponent(storefront.slug)}`}>OPEN PUBLIC LINK →</a> : null}</div>
      <form className="sfform" onSubmit={submit}>
        <label><span>STORE NAME</span><input type="text" maxLength={100} value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label><span>PUBLIC DESCRIPTION</span><textarea rows={5} maxLength={1000} value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label><span>BRAND IMAGE / BANNER HTTPS ADDRESS</span><input type="url" maxLength={2048} value={form.bannerUrl}
          onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} /></label>
        <label><span>PUBLICATION STATE</span><select value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="draft">draft</option>
          <option value="pending_review">pending review</option>
          {form.status === "active" ? <option value="active">active</option> : null}
          <option value="paused">paused</option>
        </select></label>
        <div className="sfreadonly"><span>PUBLIC SLUG</span><b>{storefront.slug || "not assigned"}</b></div>
        <div className="sfreadonly"><span>TERMS ACCEPTED</span><b>{storefront.termsVersion || storefront.terms_version || "not reported"}</b></div>
        <button className="btn" type="submit" disabled={!canEdit || !!busy}>{busy ? "SAVING…" : "SAVE STORE DETAILS"}</button>
      </form>
    </section>
  );
}

export default function StorefrontTab() {
  const [envelope, setEnvelope] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState("manage");
  const [section, setSection] = useState("products");

  const load = useCallback(async () => {
    const user = getUid() || "";
    if (!user.startsWith("sb-")) {
      setSignedOut(true); setEnvelope(null); setError(""); return;
    }
    setSignedOut(false); setError("");
    try {
      const response = await authorizedFetch(`/api/storefront?user=${encodeURIComponent(user)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setSignedOut(true); setEnvelope(null); return; }
      if (!response.ok) {
        setError(body.error || (response.status === 404
          ? "storefront service is not enabled on this deployment"
          : "the storefront record could not be read"));
        setEnvelope(null); return;
      }
      setEnvelope(normalizeEnvelope(body));
    } catch {
      setError("the storefront service could not be reached — no empty record is being assumed");
      setEnvelope(null);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("asilum:identity", load);
    return () => window.removeEventListener("asilum:identity", load);
  }, [load]);

  async function mutate(payload, success) {
    const user = getUid() || "";
    if (!user.startsWith("sb-")) { setSignedOut(true); return false; }
    setBusy(payload.action || "write"); setNotice("");
    try {
      const response = await sendJSON("POST", "/api/storefront", { user, ...payload });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const current = body.currentTermsVersion ? ` Current terms: ${body.currentTermsVersion}.` : "";
        setNotice((body.error || body.note || "the storefront change was refused") + current);
        return false;
      }
      if (body.storefront !== undefined) setEnvelope(normalizeEnvelope(body));
      else await load();
      setNotice(success || "storefront updated");
      return true;
    } catch {
      setNotice("the storefront service could not be reached — nothing was saved");
      return false;
    } finally {
      setBusy("");
    }
  }

  const reasons = useMemo(() => reasonText(envelope?.capabilities), [envelope]);

  if (signedOut) return (
    <section className="sfroot sfneedsaccount">
      <span className="sfeyebrow">STOREFRONT</span><h2>A store needs an account<span className="red">.</span></h2>
      <p className="deck">Browsing stays open. Creating and owning inventory needs a signed-in account so another device cannot claim it.</p>
      <button className="btn" type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("asilum:signup-open", { detail: { mode: "signin" } }))}>SIGN IN</button>
    </section>
  );

  if (error) return (
    <section className="sfroot"><Notice tone="error" variant="banner">{error}</Notice>
      <button className="btn ghost" type="button" onClick={load}>RETRY</button></section>
  );
  if (!envelope) return <div className="sfroot empty" role="status">reading your storefront…</div>;

  if (!envelope.storefront) return (
    <div className="sfroot">
      {notice ? <Notice tone="error" variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice> : null}
      <CreateStore termsVersion={envelope.termsVersion}
        canCreate={envelope.capabilities.canCreateStore !== false}
        reasons={reasons} busy={busy} onCreate={(payload) => mutate(payload, "store draft created")} />
    </div>
  );

  const { storefront, listings, orders, fee, capabilities } = envelope;
  return (
    <div className="sfroot">
      <div className="sfownerhead">
        <div><span className="sfeyebrow">YOUR STOREFRONT</span><h2>{storefront.name}<span className="red">.</span></h2></div>
        <div className="seg sfmode" role="group" aria-label="storefront preview or management">
          <button type="button" className={mode === "preview" ? "cur" : ""} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>PUBLIC PREVIEW</button>
          <button type="button" className={mode === "manage" ? "cur" : ""} aria-pressed={mode === "manage"} onClick={() => setMode("manage")}>MANAGE</button>
        </div>
      </div>
      {notice ? <Notice tone={/refused|could not|unavailable|current terms/i.test(notice) ? "error" : "info"}
        variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice> : null}
      {mode === "preview" ? (
        <PublicStorefrontBody storefront={storefront} listings={listings} capabilities={capabilities} preview />
      ) : (
        <>
          <CheckoutStatus capabilities={capabilities} storefront={storefront} />
          <nav className="sfmanagenav" aria-label="storefront management views">
            {[["products", "PRODUCTS"], ["orders", "ORDERS"], ["earnings", "EARNINGS / FEE"], ["details", "STORE DETAILS"]].map(([id, label]) => (
              <button type="button" key={id} className={section === id ? "cur" : ""}
                aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}</button>
            ))}
          </nav>
          {section === "products" ? <ProductsPanel listings={listings} capabilities={capabilities} busy={busy} mutate={mutate} /> : null}
          {section === "orders" ? <OrdersPanel orders={orders} capabilities={capabilities} storefront={storefront} /> : null}
          {section === "earnings" ? <EarningsPanel fee={fee} orders={orders} /> : null}
          {section === "details" ? <DetailsPanel storefront={storefront} capabilities={capabilities} busy={busy} mutate={mutate} /> : null}
        </>
      )}
    </div>
  );
}

/** The public deep link. Same shell, same catalog ids, same product modal. */
export function PublicStorefront({ slug }) {
  const [state, setState] = useState({ loading: true, error: "", envelope: null });
  const load = useCallback(async () => {
    setState({ loading: true, error: "", envelope: null });
    try {
      const response = await authorizedFetch(`/api/storefront/public?slug=${encodeURIComponent(slug || "")}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.storefront) {
        setState({ loading: false, error: response.status === 404 ? "this storefront is not public" : body.error || "the storefront could not be read", envelope: null });
        return;
      }
      setState({ loading: false, error: "", envelope: normalizeEnvelope(body) });
    } catch {
      setState({ loading: false, error: "the storefront service could not be reached", envelope: null });
    }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  if (state.loading) return <div className="sfroot empty" role="status">opening storefront…</div>;
  if (state.error) return <div className="sfroot"><Notice tone="error" variant="banner">{state.error}</Notice>
    <button className="btn ghost" type="button" onClick={load}>RETRY</button></div>;
  const { storefront, listings, capabilities } = state.envelope;
  return <div className="sfroot"><PublicStorefrontBody storefront={storefront} listings={listings} capabilities={capabilities} heading="h1" /></div>;
}
