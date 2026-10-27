// tests/storefront-onboarding.test.js — THE SELLER CONNECTS STRIPE
// (lib/storefront/onboarding.js, lib/storefront/connect.js). No provider
// call: Stripe is a double, the store is memory mode. Proves the account is
// created once in the proceeds model's shape, the link is minted on demand,
// the ledger is written only from what Stripe said, the validation stamp
// follows the deployment's artifact, modes never cross, and account.updated
// reaches the record through the one webhook door.

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

delete process.env.DATABASE_URL;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STOREFRONT_PAYMENT_VALIDATION_VERSION;

const { createPaymentOnboardingService, OnboardingRefused } = await import("../lib/storefront/onboarding.js");
const { accountReadiness, CONNECT_CONTROLLER, onboardingUrls, publicPayment } = await import("../lib/storefront/connect.js");
const storefronts = await import("../lib/db/production/storefronts.js");
const { STOREFRONT_TERMS_VERSION } = await import("../lib/storefront/contracts.js");
const { STOREFRONT_PAYMENT_VALIDATION_VERSION, storefrontRuntimeFlags } = await import("../lib/storefront/flags.js");
const { createConnectedAccount, createAccountLink } = await import("../lib/payments/stripe.js");
const { applyStripeWebhook } = await import("../lib/orders.js");

const ORIGIN = "https://www.asilummagazine.com";
const LINK = "https://connect.stripe.com/setup/s/acct_test/fixture";

function acctId() { return `acct_${randomUUID().replaceAll("-", "").slice(0, 16)}`; }

function account(id, over = {}) {
  return {
    id, object: "account",
    details_submitted: true, charges_enabled: true, payouts_enabled: true,
    controller: { fees: { payer: "account" }, losses: { payments: "stripe" }, stripe_dashboard: { type: "full" } },
    capabilities: { card_payments: "active", transfers: "active" },
    requirements: { currently_due: [], disabled_reason: null },
    ...over,
  };
}
const fresh = (id) => account(id, {
  details_submitted: false, charges_enabled: false, payouts_enabled: false,
  capabilities: { card_payments: "inactive", transfers: "inactive" },
  requirements: { currently_due: ["business_profile.url", "external_account"], disabled_reason: "requirements.past_due" },
});

async function newStore() {
  const accountId = randomUUID();
  const created = await storefronts.createStorefront({
    accountId, name: `Connect ${randomUUID().slice(0, 8)}`, accepted: true, acceptedTermsVersion: STOREFRONT_TERMS_VERSION,
  });
  return { accountId, storefrontId: created.storefront.id };
}

function service({ mode = "test", validationCurrent = false, retrieve = null, created = null } = {}) {
  const calls = { create: [], link: [], retrieve: [] };
  const svc = createPaymentOnboardingService({
    secretMode: () => mode,
    origin: () => ORIGIN,
    runtimeFlags: () => storefrontRuntimeFlags({
      STRIPE_SECRET_KEY: mode === "live" ? "sk_live_x" : "sk_test_x",
      ...(validationCurrent ? { STOREFRONT_PAYMENT_VALIDATION_VERSION } : {}),
    }),
    createAccount: async (params) => { calls.create.push(params); return (created || fresh)(acctId()); },
    createLink: async (params) => { calls.link.push(params); return { object: "account_link", url: LINK, expires_at: 1_800_000_000 }; },
    retrieveAccount: async (id) => { calls.retrieve.push(id); return (retrieve || account)(id); },
  });
  return { svc, calls };
}

test("the readiness rule mirrors the money path's: the proceeds model's controller, every capability on", () => {
  const ok = accountReadiness(account("acct_1234567890ABCDEF"));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.reasons, []);
  const platformPays = accountReadiness(account("acct_1234567890ABCDEF", { controller: { fees: { payer: "application" }, losses: { payments: "application" } } }));
  assert.equal(platformPays.ok, false);
  assert.match(platformPays.reasons.join(" "), /own processing fees/);
  assert.match(platformPays.reasons.join(" "), /payment-loss responsibility/);
  const restricted = accountReadiness(account("acct_1234567890ABCDEF", { charges_enabled: false, capabilities: { card_payments: "inactive" } }));
  assert.deepEqual(restricted.reasons, ["connected account charges are not enabled", "connected account card_payments is inactive"]);
  assert.equal(accountReadiness({}).ok, false);
  assert.deepEqual(CONNECT_CONTROLLER, { fees: { payer: "account" }, losses: { payments: "stripe" }, stripe_dashboard: { type: "full" } });
  assert.deepEqual(onboardingUrls(ORIGIN + "/"), {
    returnUrl: `${ORIGIN}/profile?payments=return#storefront`,
    refreshUrl: `${ORIGIN}/profile?payments=refresh#storefront`,
  });
  assert.throws(() => onboardingUrls("profile"), TypeError);
});

test("begin creates the account once, in shape, and mints a link each time; the ledger reads pending", async () => {
  const { accountId, storefrontId } = await newStore();
  const { svc, calls } = service();
  const first = await svc.begin({ accountId });
  assert.equal(first.url, LINK);
  assert.equal(first.expiresAt, 1_800_000_000);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0].controller, CONNECT_CONTROLLER);
  assert.equal(calls.create[0].storefrontId, storefrontId);
  assert.equal(calls.create[0].idempotencyKey, `storefront-connect:${storefrontId}:test`);
  assert.equal(calls.link[0].returnUrl, `${ORIGIN}/profile?payments=return#storefront`);
  assert.equal(first.payment.onboardingState, "pending");
  assert.equal(first.payment.connected, true);
  assert.equal(first.payment.mode, "test");
  assert.equal(first.payment.currentlyDue, 2);
  assert.equal("stripeAccountId" in first.payment, false, "the account id never leaves the server");

  const record = await storefronts.getStorefrontPaymentAccount(storefrontId);
  assert.equal(record.stripeAccountId, calls.link[0].account);
  assert.equal(record.feePayer, "account");
  assert.equal(record.lossesCollector, "stripe");
  assert.equal(record.validationVersion, null);
  assert.equal(record.capabilitySnapshot.disabled_reason, "requirements.past_due");

  const again = await svc.begin({ accountId });
  assert.equal(calls.create.length, 1, "the same storefront never gets a second account in one mode");
  assert.equal(calls.link.length, 2);
  assert.equal(calls.link[1].account, record.stripeAccountId);
  assert.equal(again.url, LINK);
});

test("refresh writes what Stripe said; the validation stamp needs the deployment's artifact and is kept once set", async () => {
  const { accountId, storefrontId } = await newStore();
  const unvalidated = service();
  await unvalidated.svc.begin({ accountId });
  const read = await unvalidated.svc.refresh({ accountId });
  assert.equal(unvalidated.calls.retrieve.length, 1);
  assert.deepEqual(read.reasons, []);
  assert.equal(read.payment.detailsSubmitted, true);
  assert.equal(read.payment.chargesEnabled, true);
  assert.equal(read.payment.payoutsEnabled, true);
  assert.equal(read.payment.validated, false);
  assert.equal(read.payment.onboardingState, "pending", "ready at Stripe is not ready for money without the artifact");

  const validated = service({ validationCurrent: true });
  const stamped = await validated.svc.refresh({ accountId });
  assert.equal(stamped.payment.onboardingState, "ready");
  assert.equal(stamped.payment.validated, true);
  const row = await storefronts.getStorefrontPaymentAccount(storefrontId);
  assert.equal(row.validationVersion, STOREFRONT_PAYMENT_VALIDATION_VERSION);
  const firstStamp = row.validatedAt;
  await new Promise((r) => setTimeout(r, 5));
  await validated.svc.refresh({ accountId });
  assert.equal((await storefronts.getStorefrontPaymentAccount(storefrontId)).validatedAt, firstStamp, "an unchanged ready account keeps its first stamp");

  // a restriction clears the stamp and reads restricted
  const restricted = service({ validationCurrent: true, retrieve: (id) => account(id, { charges_enabled: false, requirements: { currently_due: [], disabled_reason: "rejected.fraud" } }) });
  const held = await restricted.svc.refresh({ accountId });
  assert.equal(held.payment.onboardingState, "restricted");
  assert.equal(held.payment.validated, false);
  assert.equal(held.payment.disabledReason, "rejected.fraud");
  assert.equal((await storefronts.getStorefrontPaymentAccount(storefrontId)).validationVersion, null);
});

test("modes never cross: a live key replaces a test account, a test key never touches a live one; unkeyed is idle", async () => {
  const { accountId, storefrontId } = await newStore();
  const testMode = service();
  await testMode.svc.begin({ accountId });
  const testAccount = (await storefronts.getStorefrontPaymentAccount(storefrontId)).stripeAccountId;

  const live = service({ mode: "live" });
  await live.svc.begin({ accountId });
  assert.equal(live.calls.create.length, 1);
  assert.equal(live.calls.create[0].idempotencyKey, `storefront-connect:${storefrontId}:live`);
  const liveRow = await storefronts.getStorefrontPaymentAccount(storefrontId);
  assert.notEqual(liveRow.stripeAccountId, testAccount);
  assert.equal(liveRow.expectedLivemode, true);

  await assert.rejects(testMode.svc.begin({ accountId }), (e) => e instanceof OnboardingRefused && e.code === "PAYMENT_MODE_MISMATCH" && e.status === 409);
  await assert.rejects(testMode.svc.refresh({ accountId }), (e) => e.code === "PAYMENT_MODE_MISMATCH");
  assert.equal((await storefronts.getStorefrontPaymentAccount(storefrontId)).stripeAccountId, liveRow.stripeAccountId, "the live record stands");

  const idle = service({ mode: "unconfigured" });
  await assert.rejects(idle.svc.begin({ accountId }), (e) => e.code === "PAYMENT_IDLE" && e.status === 503);
  await assert.rejects(service().svc.refresh({ accountId: randomUUID() }), (e) => e.code === "STORE_NOT_FOUND" && e.status === 404);
  const { accountId: bare } = await newStore();
  await assert.rejects(service().svc.refresh({ accountId: bare }), (e) => e.code === "PAYMENT_NOT_STARTED");
});

test("account.updated reaches the storefront's record through the one webhook door; strangers are ignored", async () => {
  const { accountId, storefrontId } = await newStore();
  await service().svc.begin({ accountId });
  const id = (await storefronts.getStorefrontPaymentAccount(storefrontId)).stripeAccountId;
  assert.equal((await storefronts.getStorefrontPaymentAccountByStripeId(id)).storefrontId, storefrontId);
  assert.equal(await storefronts.getStorefrontPaymentAccountByStripeId("acct_nobody12345"), null);

  const finished = await applyStripeWebhook({
    id: "evt_account_1", type: "account.updated", livemode: false, account: id,
    data: { object: account(id) },
  });
  assert.equal(finished.handled, true);
  assert.equal(finished.onboardingState, "pending", "no validation artifact in this process");
  const row = await storefronts.getStorefrontPaymentAccount(storefrontId);
  assert.equal(row.detailsSubmitted, true);
  assert.equal(row.chargesEnabled, true);
  assert.equal(row.payoutsEnabled, true);

  const stranger = await applyStripeWebhook({
    id: "evt_account_2", type: "account.updated", livemode: false, account: "acct_nobody12345",
    data: { object: account("acct_nobody12345") },
  });
  assert.equal(stranger.ignored, true);
  assert.equal(stranger.handled, false);

  const wrongMode = await applyStripeWebhook({
    id: "evt_account_3", type: "account.updated", livemode: true, account: id,
    data: { object: account(id, { charges_enabled: false }) },
  });
  assert.equal(wrongMode.ignored, true);
  assert.equal((await storefronts.getStorefrontPaymentAccount(storefrontId)).chargesEnabled, true, "a live event never rewrites a test record");
});

test("publicPayment never carries the account id and reads an empty record as not started", () => {
  assert.deepEqual(publicPayment(null), { onboardingState: "not_started", connected: false, mode: null, validated: false });
  const shown = publicPayment({ stripeAccountId: "acct_1234567890ABCDEF", expectedLivemode: true, onboardingState: "ready", validationVersion: "v", validatedAt: "2026-10-27T00:00:00.000Z", capabilitySnapshot: { currently_due: 0 } });
  assert.equal(shown.mode, "live");
  assert.equal(shown.validated, true);
  assert.equal(JSON.stringify(shown).includes("acct_"), false);
});

// ---- the Stripe seam, with a fetch double (no provider call) ------------------------------

function json(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function mockStripe(t, implementation) {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_adapter_fixture_never_sent";
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = originalFetch; delete process.env.STRIPE_SECRET_KEY; });
}

test("the account is a platform resource in the proceeds model's shape; the link is one-use onboarding", async (t) => {
  const calls = [];
  mockStripe(t, async (url, init) => {
    calls.push({ url, init, body: new URLSearchParams(init.body) });
    if (String(url).endsWith("/accounts")) return json({ id: "acct_1234567890ABCDEF", object: "account" });
    return json({ object: "account_link", url: LINK, expires_at: 1 });
  });
  const storefrontId = randomUUID();
  const made = await createConnectedAccount({ storefrontId, controller: CONNECT_CONTROLLER, idempotencyKey: `storefront-connect:${storefrontId}:test` });
  assert.equal(made.id, "acct_1234567890ABCDEF");
  const create = calls[0];
  assert.equal(create.url, "https://api.stripe.com/v1/accounts");
  assert.equal(create.init.method, "POST");
  assert.equal(create.init.headers["Stripe-Account"], undefined, "no connected-account scope on a platform resource");
  assert.equal(create.init.headers["Idempotency-Key"], `storefront-connect:${storefrontId}:test`);
  assert.equal(create.body.get("controller[fees][payer]"), "account");
  assert.equal(create.body.get("controller[losses][payments]"), "stripe");
  assert.equal(create.body.get("controller[stripe_dashboard][type]"), "full");
  assert.equal(create.body.get("capabilities[card_payments][requested]"), "true");
  assert.equal(create.body.get("capabilities[transfers][requested]"), "true");
  assert.equal(create.body.get("metadata[storefront_id]"), storefrontId);
  assert.equal(create.body.get("metadata[kind]"), "native_storefront");

  const link = await createAccountLink({ account: "acct_1234567890ABCDEF", returnUrl: `${ORIGIN}/profile?payments=return#storefront`, refreshUrl: `${ORIGIN}/profile?payments=refresh#storefront` });
  assert.equal(link.url, LINK);
  const minted = calls[1];
  assert.equal(minted.url, "https://api.stripe.com/v1/account_links");
  assert.equal(minted.body.get("account"), "acct_1234567890ABCDEF");
  assert.equal(minted.body.get("type"), "account_onboarding");
  assert.equal(minted.body.get("return_url"), `${ORIGIN}/profile?payments=return#storefront`);
  assert.equal(minted.body.get("refresh_url"), `${ORIGIN}/profile?payments=refresh#storefront`);

  await assert.rejects(createConnectedAccount({ storefrontId: "not-a-uuid", controller: CONNECT_CONTROLLER, idempotencyKey: "k" }), TypeError);
  await assert.rejects(createAccountLink({ account: "acct_1234567890ABCDEF", returnUrl: "/profile", refreshUrl: `${ORIGIN}/x` }), TypeError);
  await assert.rejects(createAccountLink({ account: "nope", returnUrl: `${ORIGIN}/x`, refreshUrl: `${ORIGIN}/x` }), TypeError);
});
