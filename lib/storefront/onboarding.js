// lib/storefront/onboarding.js — THE SELLER CONNECTS STRIPE (V.2 chapter 7;
// owner, 27 Oct 2026: "plug in stripe"). The storefront branch kept a private
// payment-account record (schema v62) that only a test ever wrote, so no
// seller could reach "ready". This is the door: ASILUM creates the connected
// account in the proceeds model's shape (lib/storefront/connect.js), sends the
// seller to Stripe's hosted onboarding, and reads the account back — on
// return, on demand, and on every `account.updated` the webhook delivers. The
// ledger is written only from what Stripe said, never from the browser.
//
//   begin    create (or continue) the account and mint a one-use onboarding link
//   refresh  retrieve the account and sync the ledger
//   webhook  account.updated → the same sync, from the signed event
//
// THE VALIDATION STAMP (validation_version / validated_at) is what native
// checkout requires of the row (lib/db/storefrontCheckout.js assertAuthority).
// It is set when the account passes the readiness rule AND the deployment
// carries the current STOREFRONT_PAYMENT_VALIDATION_VERSION — the owner's
// proof that the isolated Connect test ran — and cleared when either lapses.
// MODES: a test-mode account is replaced by a live one when the key goes
// live; a live account is never overwritten from a test key. SERVER-ONLY.

import {
  getStorefrontForOwner, getStorefrontPaymentAccount, getStorefrontPaymentAccountByStripeId,
  syncStorefrontPaymentAccount,
} from "../db/production/storefronts.js";
import { createConnectedAccount, createAccountLink, retrieveConnectedAccount } from "../payments/stripe.js";
import { storefrontRuntimeFlags, stripeSecretMode, STOREFRONT_PAYMENT_VALIDATION_VERSION } from "./flags.js";
import { CONNECT_CONTROLLER, accountReadiness, capabilitySnapshot, onboardingUrls, publicPayment } from "./connect.js";
import { SITE_ORIGIN } from "../site.js";

export class OnboardingRefused extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "OnboardingRefused";
    this.code = code;
    this.status = status;
  }
}

const productionDependencies = {
  getOwner: getStorefrontForOwner,
  getPaymentAccount: getStorefrontPaymentAccount,
  findByStripeId: getStorefrontPaymentAccountByStripeId,
  sync: syncStorefrontPaymentAccount,
  createAccount: createConnectedAccount,
  createLink: createAccountLink,
  retrieveAccount: retrieveConnectedAccount,
  runtimeFlags: storefrontRuntimeFlags,
  secretMode: () => stripeSecretMode(process.env.STRIPE_SECRET_KEY || ""),
  origin: () => SITE_ORIGIN,
  now: () => new Date(),
};

export function createPaymentOnboardingService(overrides = {}) {
  const deps = { ...productionDependencies, ...overrides };

  function keyMode() {
    const m = deps.secretMode();
    if (m === "unconfigured") throw new OnboardingRefused("PAYMENT_IDLE", "payment processing is not configured on this deployment", 503);
    if (m === "invalid") throw new OnboardingRefused("PAYMENT_KEY_INVALID", "the payment key mode is not recognized", 503);
    return m;
  }

  async function ownerStore(accountId) {
    const envelope = await deps.getOwner(accountId);
    const store = envelope?.storefront || null;
    if (!store) throw new OnboardingRefused("STORE_NOT_FOUND", "create a storefront before connecting payments", 404);
    if (["archived", "rejected"].includes(store.state)) {
      throw new OnboardingRefused("STORE_CLOSED", `a ${store.state} storefront cannot connect payments`, 409);
    }
    return store;
  }

  /** Write what Stripe said about the account. The only product writer of the row. */
  async function syncFromAccount(storefrontId, account, { livemode }) {
    const readiness = accountReadiness(account);
    if (!readiness.facts.stripeAccountId) throw new OnboardingRefused("PROVIDER_ACCOUNT_INVALID", "Stripe returned no account id", 502);
    const flags = deps.runtimeFlags();
    const at = deps.now().toISOString();
    const prior = await deps.getPaymentAccount(storefrontId).catch(() => null);
    const validated = readiness.ok && flags.validationCurrent === true;
    const keepStamp = validated
      && prior?.stripeAccountId === account.id
      && prior?.validationVersion === STOREFRONT_PAYMENT_VALIDATION_VERSION
      && Boolean(prior?.validatedAt);
    const payment = await deps.sync({
      storefrontId,
      stripeAccountId: account.id,
      expectedLivemode: livemode === true,
      detailsSubmitted: readiness.facts.detailsSubmitted,
      chargesEnabled: readiness.facts.chargesEnabled,
      payoutsEnabled: readiness.facts.payoutsEnabled,
      feePayer: readiness.facts.feePayer,
      lossesCollector: readiness.facts.lossesCollector,
      capabilitySnapshot: capabilitySnapshot(account, { at }),
      validationVersion: validated ? STOREFRONT_PAYMENT_VALIDATION_VERSION : null,
      validatedAt: validated ? (keepStamp ? prior.validatedAt : at) : null,
      providerRetrievedAt: at,
    });
    return { payment, readiness };
  }

  /** Create or continue the connected account; answer with a one-use hosted onboarding link. */
  async function begin({ accountId, origin = deps.origin() } = {}) {
    const m = keyMode();
    const livemode = m === "live";
    const store = await ownerStore(accountId);
    const prior = await deps.getPaymentAccount(store.id);
    let stripeAccountId = prior?.stripeAccountId || null;
    if (stripeAccountId && prior.expectedLivemode === true && !livemode) {
      throw new OnboardingRefused("PAYMENT_MODE_MISMATCH", "this storefront's payment account is live; a test key cannot continue it", 409);
    }
    if (!stripeAccountId || prior.expectedLivemode !== livemode) {
      // a fresh account for this mode (a test account is replaced when the key goes live)
      const account = await deps.createAccount({
        storefrontId: store.id,
        controller: CONNECT_CONTROLLER,
        idempotencyKey: `storefront-connect:${store.id}:${m}`,
      });
      await syncFromAccount(store.id, account, { livemode });
      stripeAccountId = account.id;
    }
    const urls = onboardingUrls(origin);
    const link = await deps.createLink({ account: stripeAccountId, returnUrl: urls.returnUrl, refreshUrl: urls.refreshUrl });
    if (typeof link?.url !== "string" || !/^https:\/\//.test(link.url)) {
      throw new OnboardingRefused("PROVIDER_LINK_INVALID", "Stripe returned no onboarding link", 502);
    }
    const current = await deps.getPaymentAccount(store.id);
    return {
      url: link.url,
      expiresAt: Number.isSafeInteger(Number(link.expires_at)) ? Number(link.expires_at) : null,
      payment: publicPayment(current),
    };
  }

  /** Read the account back from Stripe and sync the ledger. */
  async function refresh({ accountId } = {}) {
    const m = keyMode();
    const store = await ownerStore(accountId);
    const prior = await deps.getPaymentAccount(store.id);
    if (!prior?.stripeAccountId) {
      throw new OnboardingRefused("PAYMENT_NOT_STARTED", "payments have not been connected for this storefront", 409);
    }
    if (prior.expectedLivemode !== (m === "live")) {
      throw new OnboardingRefused("PAYMENT_MODE_MISMATCH", `this storefront's payment account is ${prior.expectedLivemode ? "live" : "test"} mode; the deployment's key is ${m}`, 409);
    }
    const account = await deps.retrieveAccount(prior.stripeAccountId);
    if (account?.id !== prior.stripeAccountId) throw new OnboardingRefused("PROVIDER_ACCOUNT_INVALID", "Stripe returned a different account", 502);
    const { payment, readiness } = await syncFromAccount(store.id, account, { livemode: m === "live" });
    return { payment: publicPayment(payment), reasons: readiness.reasons };
  }

  /** `account.updated` from the signed webhook: the same sync, from the event's own object. */
  async function webhook(event) {
    if (event?.type !== "account.updated") return { claimed: false };
    const object = event?.data?.object;
    const id = typeof object?.id === "string" ? object.id : "";
    let prior = null;
    try { prior = id ? await deps.findByStripeId(id) : null; } catch { prior = null; }
    if (!prior) return { claimed: true, handled: false, ignored: true, reason: "account is not a storefront's" };
    const livemode = event.livemode === true;
    if (prior.expectedLivemode !== livemode) {
      return { claimed: true, handled: false, ignored: true, reason: "event mode does not match the recorded account" };
    }
    const { payment } = await syncFromAccount(prior.storefrontId, object, { livemode });
    return { claimed: true, handled: true, onboardingState: payment.onboardingState };
  }

  return { begin, refresh, webhook, syncFromAccount };
}

const production = createPaymentOnboardingService();
export const beginPaymentOnboarding = production.begin;
export const refreshPaymentOnboarding = production.refresh;
export const applyPaymentOnboardingWebhook = production.webhook;
export { publicPayment };
