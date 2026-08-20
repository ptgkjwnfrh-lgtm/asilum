// lib/vault.js
// The buyer vault (owner ruling 20 Aug 2026): name, address, and saved-card
// REFERENCES — Stripe customer/payment-method ids plus brand/last4 display
// metadata. Never a card number; Stripe holds the card. SERVER-ONLY, and
// deliberately apart from lib/db: its table lives in schema `buyer_vault`, not
// `public`. Exactly two access paths exist by law — SETTINGS and the first
// purchase — and tests/vault-access.test.js enforces that import graph.

import { getPool } from "./db/index.js";

const mem = new Map(); // user_id -> row (memory-mode mirror)

const S = (v, n) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, n);
  return s || null;
};

function publicProfile(row) {
  if (!row) return null;
  return {
    full_name: row.full_name || null,
    address_line1: row.address_line1 || null,
    address_line2: row.address_line2 || null,
    city: row.city || null,
    region: row.region || null,
    postal_code: row.postal_code || null,
    country: row.country || null,
    card_brand: row.card_brand || null,
    card_last4: row.card_last4 || null,
    has_saved_card: Boolean(row.stripe_customer_id && row.default_payment_method),
    consent_at: row.consent_at || null,
  };
}

// Internal read — includes Stripe references. Never serialize this to a
// client; publicBuyerProfile is the outward shape.
export async function getBuyerProfile(userId) {
  if (!userId) return null;
  const p = await getPool();
  if (!p) return mem.get(userId) || null;
  const r = await p.query(`SELECT * FROM buyer_vault.buyer_profiles WHERE user_id=$1`, [userId]);
  return r.rows[0] || null;
}

export async function publicBuyerProfile(userId) {
  return publicProfile(await getBuyerProfile(userId));
}

// Identity fields (name + address). Fields passed as null/undefined leave
// the stored value alone, so SETTINGS can edit one line without retyping
// the rest. consent_at stamps on first insert — the moment the buyer chose
// to store their information.
export async function upsertBuyerIdentity(userId, fields = {}) {
  if (!userId) throw new TypeError("vault: userId required");
  const f = {
    full_name: S(fields.fullName, 120),
    address_line1: S(fields.addressLine1, 160),
    address_line2: S(fields.addressLine2, 160),
    city: S(fields.city, 80),
    region: S(fields.region, 80),
    postal_code: S(fields.postalCode, 20),
    country: S(fields.country, 60),
  };
  const p = await getPool();
  if (!p) {
    const row = mem.get(userId) || { user_id: userId, consent_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(f)) if (v !== null) row[k] = v;
    row.updated_at = new Date().toISOString();
    mem.set(userId, row);
    return publicProfile(row);
  }
  const r = await p.query(
    `INSERT INTO buyer_vault.buyer_profiles
       (user_id, full_name, address_line1, address_line2, city, region, postal_code, country, consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (user_id) DO UPDATE SET
       full_name     = COALESCE(EXCLUDED.full_name,     buyer_profiles.full_name),
       address_line1 = COALESCE(EXCLUDED.address_line1, buyer_profiles.address_line1),
       address_line2 = COALESCE(EXCLUDED.address_line2, buyer_profiles.address_line2),
       city          = COALESCE(EXCLUDED.city,          buyer_profiles.city),
       region        = COALESCE(EXCLUDED.region,        buyer_profiles.region),
       postal_code   = COALESCE(EXCLUDED.postal_code,   buyer_profiles.postal_code),
       country       = COALESCE(EXCLUDED.country,       buyer_profiles.country),
       updated_at    = now()
     RETURNING *`,
    [userId, f.full_name, f.address_line1, f.address_line2, f.city, f.region, f.postal_code, f.country]
  );
  return publicProfile(r.rows[0]);
}

// Saved-card references. paymentMethod null keeps the stored one (used to
// record the Stripe customer id before any card exists).
export async function attachSavedCard(userId, { customerId = null, paymentMethod = null, brand = null, last4 = null } = {}) {
  if (!userId) throw new TypeError("vault: userId required");
  const p = await getPool();
  if (!p) {
    const row = mem.get(userId) || { user_id: userId, consent_at: new Date().toISOString() };
    if (customerId) row.stripe_customer_id = customerId;
    if (paymentMethod) row.default_payment_method = paymentMethod;
    if (brand) row.card_brand = S(brand, 20);
    if (last4) row.card_last4 = S(last4, 4);
    row.updated_at = new Date().toISOString();
    mem.set(userId, row);
    return publicProfile(row);
  }
  const r = await p.query(
    `INSERT INTO buyer_vault.buyer_profiles (user_id, stripe_customer_id, default_payment_method, card_brand, card_last4, consent_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id,     buyer_profiles.stripe_customer_id),
       default_payment_method = COALESCE(EXCLUDED.default_payment_method, buyer_profiles.default_payment_method),
       card_brand             = COALESCE(EXCLUDED.card_brand,             buyer_profiles.card_brand),
       card_last4             = COALESCE(EXCLUDED.card_last4,             buyer_profiles.card_last4),
       updated_at             = now()
     RETURNING *`,
    [userId, S(customerId, 80), S(paymentMethod, 80), S(brand, 20), S(last4, 4)]
  );
  return publicProfile(r.rows[0]);
}

// Forgetting is first-class: drop the card, keep the identity…
export async function removeSavedCard(userId) {
  if (!userId) return null;
  const p = await getPool();
  if (!p) {
    const row = mem.get(userId);
    if (!row) return null;
    row.default_payment_method = null;
    row.card_brand = null;
    row.card_last4 = null;
    row.updated_at = new Date().toISOString();
    return publicProfile(row);
  }
  const r = await p.query(
    `UPDATE buyer_vault.buyer_profiles
     SET default_payment_method=NULL, card_brand=NULL, card_last4=NULL, updated_at=now()
     WHERE user_id=$1 RETURNING *`,
    [userId]
  );
  return r.rows[0] ? publicProfile(r.rows[0]) : null;
}

// …or erase the whole profile.
export async function deleteBuyerProfile(userId) {
  if (!userId) return false;
  const p = await getPool();
  if (!p) return mem.delete(userId);
  const r = await p.query(`DELETE FROM buyer_vault.buyer_profiles WHERE user_id=$1`, [userId]);
  return r.rowCount > 0;
}
