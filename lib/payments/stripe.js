// lib/payments/stripe.js
// Thin Stripe REST client: fetch + form encoding + node crypto, no SDK (stack
// law: no new runtime dependencies). SERVER-ONLY — never import from client
// modules. Test vs live is decided solely by which key sits in
// STRIPE_SECRET_KEY; nothing here chooses a mode.
//
// Checkout is Stripe-HOSTED: the buyer pays on checkout.stripe.com, so card
// data never touches this codebase or its servers (SAQ-A posture). The only
// Stripe artifacts we hold are session/event ids and the secret key itself.

import crypto from "node:crypto";

const API = "https://api.stripe.com/v1";

/** Is a Stripe secret key present? Every payment surface answers 503 when this
 *  is false rather than failing at the API call — an unconfigured deployment
 *  says so honestly instead of looking broken. */
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export class StripeApiError extends Error {
  constructor(status, body) {
    const inner = body && body.error ? body.error : {};
    super(inner.message || `stripe request failed (${status})`);
    this.name = "StripeApiError";
    this.status = status;
    this.code = inner.code || null;
    this.type = inner.type || null;
  }
}

// Stripe's form encoding for nested params: {a:{b:1}, c:[{d:2}]} →
// a[b]=1&c[0][d]=2. Arrays index, objects bracket, scalars stringify.
export function stripeFormEncode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((entry, i) => {
        if (entry && typeof entry === "object") stripeFormEncode(entry, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(entry));
      });
    } else if (typeof value === "object") {
      stripeFormEncode(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

/**
 * The one door to the Stripe API. Every call goes through here.
 *
 * Throws StripeApiError carrying the status and Stripe's own error body, so a
 * caller can distinguish a declined card from an outage from a bad key.
 * SERVER-ONLY: the secret key is read here and must never reach a response.
 */
export async function stripeRequest(method, path, params = null) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeApiError(0, { error: { message: "STRIPE_SECRET_KEY is not set" } });
  const init = {
    method,
    headers: { Authorization: `Bearer ${key}` },
  };
  let url = `${API}${path}`;
  if (params && method === "GET") {
    url += `?${stripeFormEncode(params).toString()}`;
  } else if (params) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = stripeFormEncode(params).toString();
  }
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) throw new StripeApiError(res.status, body);
  return body;
}

// One session per order. amountCents/feeCents are trusted server state (never
// client figures); the founders fee rides as its own line item so the buyer
// sees it itemized before paying. origin is the caller's canonical origin —
// routes pass SITE_ORIGIN, local verification passes its own localhost.
export async function createCheckoutSession({ orderId, itemId, title, amountCents, feeCents = 0, currency, origin, user }) {
  const lineItems = [{
    quantity: 1,
    price_data: {
      currency,
      unit_amount: amountCents,
      product_data: { name: title },
    },
  }];
  if (feeCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: feeCents,
        product_data: { name: "Founders fee (1%)" },
      },
    });
  }
  return stripeRequest("POST", "/checkout/sessions", {
    mode: "payment",
    client_reference_id: orderId,
    line_items: lineItems,
    success_url: `${origin}/orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/orders?checkout=cancelled`,
    metadata: { order_id: orderId, item_id: itemId, user },
  });
}

export async function retrieveCheckoutSession(sessionId) {
  return stripeRequest("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

// ---- PaymentIntents: the ticket-fee lane (§6) -----------------------------
// The housing charges the founders fee ALONE while the real purchase
// completes on the source. Amounts are trusted server state; the client only
// ever holds a client secret whose amount it cannot change.

export async function createPaymentIntent({ amountCents, currency, customer = null, savePaymentMethod = false, metadata = {} }) {
  return stripeRequest("POST", "/payment_intents", {
    amount: amountCents,
    currency,
    customer: customer || undefined,
    setup_future_usage: savePaymentMethod && customer ? "off_session" : undefined,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata,
  });
}

export async function retrievePaymentIntent(id) {
  return stripeRequest("GET", `/payment_intents/${encodeURIComponent(id)}`);
}

// Off-session confirm with a saved payment method — the returning buyer's
// one-click path: no card form, no publishable key, nothing retyped.
export async function confirmPaymentIntent(id, { paymentMethod, offSession = true }) {
  return stripeRequest("POST", `/payment_intents/${encodeURIComponent(id)}/confirm`, {
    payment_method: paymentMethod,
    off_session: offSession || undefined,
  });
}

export async function createCustomer({ userId }) {
  return stripeRequest("POST", "/customers", { metadata: { asilum_user: userId } });
}

export async function retrievePaymentMethod(id) {
  return stripeRequest("GET", `/payment_methods/${encodeURIComponent(id)}`);
}

// Full refund of a paid session's payment intent. The POLICY of when to
// refund is the owner's/counsel's (docs/legal-drafts); this is only the
// mechanism, and it refunds the whole charge — partial refunds arrive when
// a real case needs one.
export async function createRefund(paymentIntentId) {
  return stripeRequest("POST", "/refunds", { payment_intent: paymentIntentId });
}

// Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=<hex hmac>…]
// v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Any valid v1 within tolerance
// passes (Stripe sends multiples during secret rolls). Constant-time compare;
// a malformed header is a refusal, never a throw.
export function verifyStripeSignature(rawBody, sigHeader, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (typeof sigHeader !== "string" || !sigHeader) return { ok: false, reason: "missing signature header" };
  let t = null;
  const candidates = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => (s || "").trim());
    if (k === "t" && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) candidates.push(v);
  }
  if (t === null) return { ok: false, reason: "no timestamp in header" };
  if (!candidates.length) return { ok: false, reason: "no v1 signature in header" };
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "hex");
    if (candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}
