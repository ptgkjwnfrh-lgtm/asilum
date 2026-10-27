// lib/storefront/connect.js — THE SELLER'S CONNECTED ACCOUNT, as a rule (V.2
// chapter 7; OWNER-DECISIONS §12, 18 Oct 2026: "SELL is subject only to the
// processor's fees, which ASILUM does not control"). PURE and client-safe:
// the shape ASILUM asks Stripe to create, and what an account must look like
// before native checkout may charge on it. The money path
// (lib/storefront/checkout.js validateAccount) re-checks the same facts on
// every charge; this module is the onboarding's reading of them.
//
//   fees.payer = account       the seller pays Stripe's processing fees
//   losses.payments = stripe   Stripe, not ASILUM, carries payment losses
//   stripe_dashboard = full    the seller keeps their own Stripe dashboard
//
// ASILUM's only take is the buyer-paid passenger fee, an application fee on
// each charge (lib/storefront/fees.js). An account built any other way is
// refused by both modules.

export const CONNECT_CONTROLLER = Object.freeze({
  fees: Object.freeze({ payer: "account" }),
  losses: Object.freeze({ payments: "stripe" }),
  stripe_dashboard: Object.freeze({ type: "full" }),
});

export const ONBOARDING_STATES = Object.freeze(["not_started", "pending", "restricted", "ready"]);

/** What a Stripe Account object says, read into the flags the ledger keeps. */
export function accountFacts(account = {}) {
  const cap = (name) => {
    const v = account?.capabilities?.[name];
    return typeof v === "string" ? v : null;
  };
  return {
    stripeAccountId: typeof account?.id === "string" && account.id.startsWith("acct_") ? account.id : null,
    detailsSubmitted: account?.details_submitted === true,
    chargesEnabled: account?.charges_enabled === true,
    payoutsEnabled: account?.payouts_enabled === true,
    feePayer: typeof account?.controller?.fees?.payer === "string" ? account.controller.fees.payer : null,
    lossesCollector: typeof account?.controller?.losses?.payments === "string" ? account.controller.losses.payments : null,
    cardPayments: cap("card_payments"),
    transfers: cap("transfers"),
    currentlyDue: Array.isArray(account?.requirements?.currently_due) ? account.requirements.currently_due.length : 0,
    disabledReason: typeof account?.requirements?.disabled_reason === "string" ? account.requirements.disabled_reason : null,
  };
}

/** May native checkout charge on this account? The same facts the money path verifies. */
export function accountReadiness(account = {}) {
  const facts = accountFacts(account);
  const reasons = [];
  if (!facts.stripeAccountId) reasons.push("no connected account");
  if (!facts.detailsSubmitted) reasons.push("connected account details are incomplete");
  if (!facts.chargesEnabled) reasons.push("connected account charges are not enabled");
  if (!facts.payoutsEnabled) reasons.push("connected account payouts are not enabled");
  if (facts.feePayer !== "account") reasons.push("connected account must pay its own processing fees for this proceeds model");
  if (facts.lossesCollector !== "stripe") reasons.push("connected account payment-loss responsibility is not approved for this proceeds model");
  if (facts.cardPayments != null && facts.cardPayments !== "active") reasons.push(`connected account card_payments is ${facts.cardPayments}`);
  return { ok: reasons.length === 0, reasons, facts };
}

/** The capability snapshot the ledger keeps: what Stripe said, and when. */
export function capabilitySnapshot(account = {}, { at = new Date().toISOString() } = {}) {
  const f = accountFacts(account);
  return {
    card_payments: f.cardPayments,
    transfers: f.transfers,
    currently_due: f.currentlyDue,
    disabled_reason: f.disabledReason,
    retrieved_at: at,
  };
}

/** Where Stripe sends the seller back: the storefront tab of their profile. */
export function onboardingUrls(origin) {
  const base = String(origin || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(base)) throw new TypeError("onboarding needs an absolute site origin");
  return {
    returnUrl: `${base}/profile?payments=return#storefront`,
    refreshUrl: `${base}/profile?payments=refresh#storefront`,
  };
}

/** What the seller's console may see of the private payment record. Never the account id. */
export function publicPayment(payment) {
  if (!payment) return { onboardingState: "not_started", connected: false, mode: null, validated: false };
  return {
    onboardingState: payment.onboardingState || "not_started",
    connected: Boolean(payment.stripeAccountId),
    mode: payment.stripeAccountId ? (payment.expectedLivemode ? "live" : "test") : null,
    detailsSubmitted: payment.detailsSubmitted === true,
    chargesEnabled: payment.chargesEnabled === true,
    payoutsEnabled: payment.payoutsEnabled === true,
    validated: Boolean(payment.validationVersion && payment.validatedAt),
    currentlyDue: Number(payment.capabilitySnapshot?.currently_due || 0),
    disabledReason: payment.capabilitySnapshot?.disabled_reason || null,
    providerRetrievedAt: payment.providerRetrievedAt || null,
  };
}
