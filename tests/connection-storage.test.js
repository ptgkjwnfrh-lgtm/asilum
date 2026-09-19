import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

delete process.env.DATABASE_URL;
process.env.CATALOG_TOKEN_KEY = randomBytes(32).toString("base64");
process.env.CATALOG_TOKEN_KEY_VERSION = "test-1";

const { encryptProviderToken, decryptProviderToken } = await import("../lib/connections/tokenVault.js");
const {
  createOAuthState, consumeOAuthState, upsertMerchantConnection,
  listMerchantConnections, enqueueCatalogJob, claimCatalogJobs, finishCatalogJob,
  disconnectMerchantConnection,
  withActiveMerchantConnection,
} = await import("../lib/db/production.js");
const { getItem, upsertItems } = await import("../lib/db/index.js");

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

test("provider tokens are authenticated to connection and field", () => {
  const encrypted = encryptProviderToken("shpat_secret", { connectionRef: "shop-1", field: "access" });
  assert.notEqual(encrypted, "shpat_secret");
  assert.equal(decryptProviderToken(encrypted, { connectionRef: "shop-1", field: "access" }), "shpat_secret");
  assert.throws(() => decryptProviderToken(encrypted, { connectionRef: "shop-2", field: "access" }));
  assert.throws(() => decryptProviderToken(encrypted, { connectionRef: "shop-1", field: "refresh" }));
});

test("token rotation keeps the previous key readable until rewrap completes", () => {
  const oldKey = process.env.CATALOG_TOKEN_KEY;
  const encrypted = encryptProviderToken("rotate-me", { connectionRef:"shop-rotation",field:"access" });
  process.env.CATALOG_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.CATALOG_TOKEN_KEY_VERSION = "test-2";
  process.env.CATALOG_TOKEN_PREVIOUS_KEYS = JSON.stringify({ "test-1":oldKey });
  assert.equal(decryptProviderToken(encrypted, { connectionRef:"shop-rotation",field:"access" }), "rotate-me");
  process.env.CATALOG_TOKEN_KEY = oldKey;
  process.env.CATALOG_TOKEN_KEY_VERSION = "test-1";
  delete process.env.CATALOG_TOKEN_PREVIOUS_KEYS;
});

test("OAuth state is account-bound, expiring, and one-use", async () => {
  await createOAuthState({ stateHash:"state-1",accountId:ACCOUNT,shopDomain:"atelier.myshopify.com",returnPath:"/board?tab=studio",expiresAt:new Date(Date.now()+60_000).toISOString() });
  assert.equal(await consumeOAuthState({ stateHash:"state-1",shopDomain:"wrong.myshopify.com" }), null);
  assert.equal((await consumeOAuthState({ stateHash:"state-1",shopDomain:"atelier.myshopify.com" })).accountId, ACCOUNT);
  assert.equal(await consumeOAuthState({ stateHash:"state-1",shopDomain:"atelier.myshopify.com" }), null, "replay refused");
});

test("connections are owner-scoped and never expose ciphertext in list responses", async () => {
  const row = await upsertMerchantConnection({
    accountId:ACCOUNT,provider:"shopify",providerAccountId:"gid://shopify/Shop/1",
    canonicalDomain:"atelier.myshopify.com",grantedScopes:["read_products"],
    policyId:"shopify-merchant",policyVersion:1,status:"syncing",
    tokenCiphertext:"cipher",refreshTokenCiphertext:"refresh",tokenKeyVersion:"test-1",
  });
  const listed = await listMerchantConnections(ACCOUNT);
  assert.equal(listed.length, 1);
  assert.equal("tokenCiphertext" in listed[0], false);
  await assert.rejects(() => upsertMerchantConnection({ ...row, accountId:"22222222-2222-4222-8222-222222222222",status:"syncing" }), /another account/);

  const job = await enqueueCatalogJob({ connectionId:row.id,kind:"shopify_initial_sync",idempotencyKey:`initial:${row.id}`,payload:{} });
  const claimed = await claimCatalogJobs("worker-a", { limit:1 });
  assert.equal(claimed[0].id, job.id);
  assert.equal((await claimCatalogJobs("worker-b", { limit:1 })).length, 0, "leased work is not double-claimed");
  assert.equal(await finishCatalogJob(job.id,"worker-b"), false, "only lease owner completes");
  assert.equal(await finishCatalogJob(job.id,"worker-a"), true);

  assert.equal(await disconnectMerchantConnection(row.id, "22222222-2222-4222-8222-222222222222"), false);
  await upsertItems([{ id:"connection-tombstone",connection_id:row.id,source_product_id:"123",title:"coat",is_available:true,availability_status:"available",resale_status:"resale" }]);
  assert.equal(await disconnectMerchantConnection(row.id, ACCOUNT), true);
  assert.equal((await getItem("connection-tombstone")).availability_status, "removed");
});

test("disconnect waits for an in-flight durable write and wins the race", async () => {
  const row = await upsertMerchantConnection({
    accountId:ACCOUNT,provider:"shopify",providerAccountId:"gid://shopify/Shop/race",
    canonicalDomain:"race.myshopify.com",grantedScopes:["read_products"],
    policyId:"shopify-merchant",policyVersion:1,status:"syncing",
  });
  let enteredResolve, writeResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const mayWrite = new Promise((resolve) => { writeResolve = resolve; });
  const writing = withActiveMerchantConnection(row.id, async () => {
    enteredResolve(); await mayWrite;
    await upsertItems([{ id:"connection-race",connection_id:row.id,source_product_id:"race",title:"coat",is_available:true,availability_status:"available",resale_status:"resale" }]);
  });
  await entered;
  const disconnecting = disconnectMerchantConnection(row.id, ACCOUNT);
  writeResolve();
  await writing;
  assert.equal(await disconnecting, true);
  assert.equal((await getItem("connection-race")).availability_status, "removed");
});
