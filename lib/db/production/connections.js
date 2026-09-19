// lib/db/production/connections.js — account-owned provider installations and
// the leased catalog queue. Public return shapes never include credentials.

import { randomUUID } from "node:crypto";
import { getPool } from "../index.js";
import { mem, push } from "./store.js";
import { mem as coreMem } from "../core/store.js";

const CONNECTION_STATUSES = new Set([
  "awaiting_authorization", "awaiting_provider_approval", "syncing", "partially_synced",
  "connected", "permission_changed", "rate_limited", "paused", "revoked", "unavailable",
]);
const RUNNABLE_CONNECTION_STATUSES = new Set(["syncing","connected","partially_synced","rate_limited"]);
const localConnectionLocks = new Map();

function redactMemoryConnectionItems(id) {
  for (const item of coreMem.items.values()) {
    if (item.connection_id !== id) continue;
    Object.assign(item, {
      title:"[removed listing]",title_original:null,brand:null,price:null,currency:null,money_amount_minor:null,
      tags:{},designers:[],description:null,img:null,images:[],url:null,source_product_url:null,clickout_url:null,
      category:null,subcategory:null,color:null,colors:[],colorEvidence:null,material:null,fit:null,silhouette:null,
      condition:null,size:null,era:null,decade:null,source_product_id:null,source_attributes:{},
      is_available:false,availability_status:"removed",
    });
  }
  mem.productTags = mem.productTags.filter((tag) => coreMem.items.get(tag.productId)?.connection_id !== id);
}

async function redactConnectionItems(client, id) {
  await client.query("DELETE FROM product_tags WHERE product_id IN (SELECT id FROM items WHERE connection_id=$1::text)", [id]);
  await client.query("DELETE FROM product_images WHERE product_id IN (SELECT id FROM items WHERE connection_id=$1::text)", [id]);
  await client.query("DELETE FROM catalog_variants WHERE connection_id=$1", [id]);
  await client.query(
    `UPDATE items SET title='[removed listing]',title_original=NULL,brand=NULL,price=NULL,currency=NULL,
       money_amount_minor=NULL,tags='{}'::jsonb,designers='[]'::jsonb,description=NULL,img=NULL,alt=NULL,
       url=NULL,source_product_url=NULL,clickout_url=NULL,category=NULL,subcategory=NULL,color=NULL,
       color_evidence='{}'::jsonb,material=NULL,fit=NULL,silhouette=NULL,condition=NULL,size=NULL,
       era=NULL,decade=NULL,source_product_id=NULL,source_attributes='{}'::jsonb,
       is_available=false,availability_status='removed',updated_at=now()
     WHERE connection_id=$1::text`, [id]);
}

async function withLocalConnectionLock(id, fn) {
  const previous = localConnectionLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  localConnectionLocks.set(id, tail);
  await previous;
  try { return await fn(); }
  finally { release(); if (localConnectionLocks.get(id) === tail) localConnectionLocks.delete(id); }
}

export async function withActiveMerchantConnection(id, fn) {
  if (!id || typeof fn !== "function") throw new TypeError("active connection lock requires an id and callback");
  const p = await getPool();
  if (!p) return withLocalConnectionLock(id, async () => {
    const row = mem.merchantConnections.get(id);
    if (!row || !RUNNABLE_CONNECTION_STATUSES.has(row.status)) throw new Error("connection is not active");
    return fn();
  });
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const active = await client.query(
      "SELECT 1 FROM merchant_connections WHERE id=$1 AND status IN ('syncing','connected','partially_synced','rate_limited') FOR SHARE", [id]);
    if (!active.rowCount) { await client.query("ROLLBACK"); throw new Error("connection is not active"); }
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

function connectionRow(row, { secrets = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    accountId: row.account_id ?? row.accountId,
    provider: row.provider,
    providerAccountId: row.provider_account_id ?? row.providerAccountId,
    canonicalDomain: row.canonical_domain ?? row.canonicalDomain,
    grantedScopes: row.granted_scopes ?? row.grantedScopes ?? [],
    publicationSelection: row.publication_selection ?? row.publicationSelection ?? {},
    policyId: row.source_policy_id ?? row.policyId,
    policyVersion: Number(row.source_policy_version ?? row.policyVersion),
    status: row.status,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : row.tokenExpiresAt ?? null,
    refreshTokenExpiresAt: row.refresh_token_expires_at ? new Date(row.refresh_token_expires_at).toISOString() : row.refreshTokenExpiresAt ?? null,
    tokenKeyVersion: row.token_key_version ?? row.tokenKeyVersion ?? null,
    syncCursor: row.sync_cursor ?? row.syncCursor ?? {},
    importedCount: Number(row.imported_count ?? row.importedCount ?? 0),
    skippedCount: Number(row.skipped_count ?? row.skippedCount ?? 0),
    lastError: row.last_error ?? row.lastError ?? null,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : row.lastSyncedAt ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.updatedAt,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : row.revokedAt ?? null,
  };
  if (secrets) {
    out.tokenCiphertext = row.token_ciphertext ?? row.tokenCiphertext ?? null;
    out.refreshTokenCiphertext = row.refresh_token_ciphertext ?? row.refreshTokenCiphertext ?? null;
  }
  return out;
}

export async function createOAuthState({ stateHash, accountId, shopDomain, returnPath, expiresAt }) {
  const row = { stateHash, accountId, shopDomain, returnPath, expiresAt, usedAt: null, createdAt: new Date().toISOString() };
  const p = await getPool();
  if (!p) { mem.oauthStates.set(stateHash, row); return { ...row }; }
  await p.query(
    `INSERT INTO shopify_oauth_states (state_hash,account_id,shop_domain,return_path,expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [stateHash, accountId, shopDomain, returnPath, expiresAt]
  );
  return row;
}

export async function consumeOAuthState({ stateHash, shopDomain }) {
  const p = await getPool();
  if (!p) {
    const row = mem.oauthStates.get(stateHash);
    if (!row || row.usedAt || row.shopDomain !== shopDomain || new Date(row.expiresAt).getTime() <= Date.now()) return null;
    row.usedAt = new Date().toISOString();
    return { ...row };
  }
  const { rows } = await p.query(
    `UPDATE shopify_oauth_states SET used_at=now()
     WHERE state_hash=$1 AND shop_domain=$2 AND used_at IS NULL AND expires_at>now()
     RETURNING state_hash,account_id,shop_domain,return_path,expires_at,used_at`,
    [stateHash, shopDomain]
  );
  if (!rows[0]) return null;
  return {
    stateHash: rows[0].state_hash, accountId: rows[0].account_id,
    shopDomain: rows[0].shop_domain, returnPath: rows[0].return_path,
    expiresAt: rows[0].expires_at, usedAt: rows[0].used_at,
  };
}

export async function upsertMerchantConnection(input) {
  if (!CONNECTION_STATUSES.has(input.status)) throw new TypeError("invalid connection status");
  const now = new Date().toISOString();
  const p = await getPool();
  if (!p) {
    const existing = [...mem.merchantConnections.values()].find((row) =>
      row.provider === input.provider && row.providerAccountId === input.providerAccountId);
    if (existing && existing.accountId !== input.accountId) throw new Error("store is already connected to another account");
    const id = existing?.id || input.id || randomUUID();
    const row = { ...existing, ...input, id, createdAt: existing?.createdAt || now, updatedAt: now };
    mem.merchantConnections.set(id, row);
    return connectionRow(row, { secrets: true });
  }
  const { rows } = await p.query(
    `INSERT INTO merchant_connections
      (account_id,provider,provider_account_id,canonical_domain,granted_scopes,
       publication_selection,source_policy_id,source_policy_version,status,
       token_ciphertext,refresh_token_ciphertext,token_expires_at,
       refresh_token_expires_at,token_key_version,sync_cursor,last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (provider,provider_account_id) DO UPDATE SET
       canonical_domain=EXCLUDED.canonical_domain,granted_scopes=EXCLUDED.granted_scopes,
       publication_selection=EXCLUDED.publication_selection,
       source_policy_id=EXCLUDED.source_policy_id,source_policy_version=EXCLUDED.source_policy_version,
       status=EXCLUDED.status,token_ciphertext=EXCLUDED.token_ciphertext,
       refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,
       token_expires_at=EXCLUDED.token_expires_at,
       refresh_token_expires_at=EXCLUDED.refresh_token_expires_at,
       token_key_version=EXCLUDED.token_key_version,sync_cursor=EXCLUDED.sync_cursor,
       last_error=EXCLUDED.last_error,revoked_at=NULL,updated_at=now()
     WHERE merchant_connections.account_id=EXCLUDED.account_id
     RETURNING *`,
    [input.accountId,input.provider,input.providerAccountId,input.canonicalDomain,input.grantedScopes || [],
      JSON.stringify(input.publicationSelection || {}),input.policyId,input.policyVersion,input.status,
      input.tokenCiphertext || null,input.refreshTokenCiphertext || null,input.tokenExpiresAt || null,
      input.refreshTokenExpiresAt || null,input.tokenKeyVersion || null,JSON.stringify(input.syncCursor || {}),input.lastError || null]
  );
  if (!rows[0]) throw new Error("store is already connected to another account");
  return connectionRow(rows[0], { secrets: true });
}

export async function listMerchantConnections(accountId) {
  const p = await getPool();
  if (!p) return [...mem.merchantConnections.values()].filter((row) => row.accountId === accountId).map((row) => connectionRow(row));
  const { rows } = await p.query(
    `SELECT * FROM merchant_connections WHERE account_id=$1 ORDER BY created_at DESC`, [accountId]);
  return rows.map((row) => connectionRow(row));
}

export async function getMerchantConnection(id, { accountId = null, secrets = false } = {}) {
  const p = await getPool();
  if (!p) {
    const row = mem.merchantConnections.get(id);
    return row && (!accountId || row.accountId === accountId) ? connectionRow(row, { secrets }) : null;
  }
  const params = accountId ? [id, accountId] : [id];
  const { rows } = await p.query(
    `SELECT * FROM merchant_connections WHERE id=$1${accountId ? " AND account_id=$2" : ""}`, params);
  return connectionRow(rows[0], { secrets });
}

export async function getMerchantConnectionByDomain(provider, canonicalDomain, { secrets = false, includeRevoked = false } = {}) {
  const p = await getPool();
  if (!p) {
    const row = [...mem.merchantConnections.values()].find((candidate) =>
      candidate.provider === provider && candidate.canonicalDomain === canonicalDomain && (includeRevoked || candidate.status !== "revoked"));
    return connectionRow(row, { secrets });
  }
  const { rows } = await p.query(
    `SELECT * FROM merchant_connections
     WHERE provider=$1 AND canonical_domain=$2${includeRevoked ? "" : " AND revoked_at IS NULL"}
     ORDER BY updated_at DESC LIMIT 1`, [provider, canonicalDomain]);
  return connectionRow(rows[0], { secrets });
}

export async function setConnectionStatus(id, {
  status, syncCursor, importedCount, skippedCount, lastError = null, lastSyncedAt = null,
}) {
  if (!CONNECTION_STATUSES.has(status)) throw new TypeError("invalid connection status");
  const p = await getPool();
  if (!p) {
    const current = mem.merchantConnections.get(id);
    if (!current) return null;
    const row = {
      ...current, status,
      ...(syncCursor !== undefined ? { syncCursor } : {}),
      ...(importedCount !== undefined ? { importedCount } : {}),
      ...(skippedCount !== undefined ? { skippedCount } : {}),
      lastError, ...(lastSyncedAt ? { lastSyncedAt } : {}), updatedAt: new Date().toISOString(),
    };
    mem.merchantConnections.set(id, row);
    return connectionRow(row);
  }
  const { rows } = await p.query(
    `UPDATE merchant_connections SET status=$2,
       sync_cursor=COALESCE($3::jsonb,sync_cursor),
       imported_count=COALESCE($4,imported_count),skipped_count=COALESCE($5,skipped_count),
       last_error=$6,last_synced_at=COALESCE($7,last_synced_at),updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id,status,syncCursor === undefined ? null : JSON.stringify(syncCursor),importedCount ?? null,skippedCount ?? null,lastError,lastSyncedAt]
  );
  return connectionRow(rows[0]);
}

export async function claimConnectionRefresh(id, leaseMs = 30_000) {
  const until = new Date(Date.now() + leaseMs).toISOString();
  const p = await getPool();
  if (!p) {
    const row = mem.merchantConnections.get(id);
    if (!row || (row.refreshLeaseUntil && new Date(row.refreshLeaseUntil).getTime() > Date.now())) return false;
    row.refreshLeaseUntil = until;
    return true;
  }
  const result = await p.query(
    `UPDATE merchant_connections SET refresh_lease_until=$2,updated_at=now()
     WHERE id=$1 AND (refresh_lease_until IS NULL OR refresh_lease_until<now())`, [id, until]);
  return result.rowCount === 1;
}

export async function rotateConnectionTokens(id, input) {
  const p = await getPool();
  if (!p) {
    const row = mem.merchantConnections.get(id);
    if (!row) return null;
    Object.assign(row, input, { refreshLeaseUntil: null, updatedAt: new Date().toISOString() });
    return connectionRow(row, { secrets: true });
  }
  const { rows } = await p.query(
    `UPDATE merchant_connections SET token_ciphertext=$2,refresh_token_ciphertext=$3,
       token_expires_at=$4,refresh_token_expires_at=$5,token_key_version=$6,
       refresh_lease_until=NULL,updated_at=now() WHERE id=$1 RETURNING *`,
    [id,input.tokenCiphertext,input.refreshTokenCiphertext,input.tokenExpiresAt,input.refreshTokenExpiresAt,input.tokenKeyVersion]
  );
  return connectionRow(rows[0], { secrets: true });
}

export async function disconnectMerchantConnection(id, accountId) {
  const p = await getPool();
  if (!p) {
    return withLocalConnectionLock(id, async () => {
      const row = mem.merchantConnections.get(id);
      if (!row || row.accountId !== accountId) return false;
      Object.assign(row, { status: "revoked", tokenCiphertext: null, refreshTokenCiphertext: null, revokedAt: new Date().toISOString() });
      for (const job of mem.catalogJobs.values()) if (job.connectionId === id && !["completed","failed"].includes(job.status)) job.status = "canceled";
      redactMemoryConnectionItems(id);
      return true;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const updated = await client.query(
      `UPDATE merchant_connections SET status='revoked',token_ciphertext=NULL,
       refresh_token_ciphertext=NULL,refresh_lease_until=NULL,revoked_at=now(),updated_at=now()
       WHERE id=$1 AND account_id=$2 RETURNING id`, [id, accountId]);
    if (!updated.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query(
      `UPDATE catalog_jobs SET status='canceled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
       WHERE connection_id=$1 AND status IN ('pending','retry','running')`, [id]);
    await redactConnectionItems(client, id);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function pauseMerchantConnection(id, accountId) {
  const p = await getPool();
  if (!p) return withLocalConnectionLock(id, async () => {
    const row = mem.merchantConnections.get(id);
    if (!row || row.accountId !== accountId || row.status === "revoked") return false;
    Object.assign(row, { status:"paused",updatedAt:new Date().toISOString() });
    for (const job of mem.catalogJobs.values()) if (job.connectionId === id && ["pending","retry","running"].includes(job.status)) job.status="canceled";
    for (const item of coreMem.items.values()) if (item.connection_id === id) Object.assign(item, { is_available:false,availability_status:"unknown" });
    return true;
  });
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const changed = await client.query(
      "UPDATE merchant_connections SET status='paused',updated_at=now() WHERE id=$1 AND account_id=$2 AND status<>'revoked' RETURNING id",
      [id,accountId]);
    if (!changed.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query(
      "UPDATE catalog_jobs SET status='canceled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE connection_id=$1 AND status IN ('pending','retry','running')", [id]);
    await client.query(
      "UPDATE items SET is_available=false,availability_status='unknown',updated_at=now() WHERE connection_id=$1::text", [id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function updateConnectionScopesFromProvider(id, scopes = []) {
  const clean = [...new Set(scopes.map(String).filter(Boolean))];
  const usable = clean.includes("read_products");
  const status = usable ? "syncing" : "permission_changed";
  const p = await getPool();
  if (!p) return withLocalConnectionLock(id, async () => {
    const row = mem.merchantConnections.get(id);
    if (!row || row.status === "revoked") return false;
    Object.assign(row, { grantedScopes:clean,status,updatedAt:new Date().toISOString() });
    if (!usable) {
      for (const job of mem.catalogJobs.values()) if (job.connectionId === id && ["pending","retry","running"].includes(job.status)) job.status="canceled";
      for (const item of coreMem.items.values()) if (item.connection_id === id) Object.assign(item, { is_available:false,availability_status:"unknown" });
    }
    return true;
  });
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const changed = await client.query(
      "UPDATE merchant_connections SET granted_scopes=$2,status=$3,updated_at=now() WHERE id=$1 AND status<>'revoked' RETURNING id",
      [id,clean,status]);
    if (!changed.rowCount) { await client.query("ROLLBACK"); return false; }
    if (!usable) {
      await client.query("UPDATE catalog_jobs SET status='canceled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE connection_id=$1 AND status IN ('pending','retry','running')", [id]);
      await client.query("UPDATE items SET is_available=false,availability_status='unknown',updated_at=now() WHERE connection_id=$1::text", [id]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

/** Provider-originated revocation (uninstall / shop redact). This intentionally
 * has no account-id argument: callers must already have authenticated the
 * provider webhook before reaching it. */
export async function revokeMerchantConnectionFromProvider(id) {
  const p = await getPool();
  if (!p) {
    return withLocalConnectionLock(id, async () => {
      const row = mem.merchantConnections.get(id);
      if (!row) return false;
      Object.assign(row, { status: "revoked", tokenCiphertext: null, refreshTokenCiphertext: null, revokedAt: new Date().toISOString() });
      for (const job of mem.catalogJobs.values()) if (job.connectionId === id && !["completed","failed"].includes(job.status)) job.status = "canceled";
      redactMemoryConnectionItems(id);
      return true;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const updated = await client.query(
      `UPDATE merchant_connections SET status='revoked',token_ciphertext=NULL,
       refresh_token_ciphertext=NULL,refresh_lease_until=NULL,revoked_at=now(),updated_at=now()
       WHERE id=$1 RETURNING id`, [id]);
    if (!updated.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query(
      `UPDATE catalog_jobs SET status='canceled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
       WHERE connection_id=$1 AND status IN ('pending','retry','running')`, [id]);
    await redactConnectionItems(client, id);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function purgeMerchantConnectionFromProvider(id) {
  const p = await getPool();
  if (!p) {
    return withLocalConnectionLock(id, async () => {
      const row = mem.merchantConnections.get(id);
      if (!row) return false;
      mem.merchantConnections.delete(id);
      for (const [jobId, job] of mem.catalogJobs) if (job.connectionId === id) mem.catalogJobs.delete(jobId);
      for (const [variantId, variant] of mem.catalogVariants) if (variant.connectionId === id) mem.catalogVariants.delete(variantId);
      for (const [deliveryId, delivery] of mem.webhookDeliveries) if (delivery.connectionId === id) mem.webhookDeliveries.delete(deliveryId);
      for (const [itemId, item] of coreMem.items) if (item.connection_id === id) coreMem.items.delete(itemId);
      return true;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog-connection:${id}`]);
    const existing = await client.query("SELECT canonical_domain FROM merchant_connections WHERE id=$1 FOR UPDATE", [id]);
    if (!existing.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query("DELETE FROM items WHERE connection_id=$1::text", [id]);
    await client.query("DELETE FROM shopify_webhook_deliveries WHERE connection_id=$1 OR shop_domain=$2", [id, existing.rows[0].canonical_domain]);
    await client.query("DELETE FROM merchant_connections WHERE id=$1", [id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function enqueueCatalogJob({ connectionId = null, kind, idempotencyKey, payload = {}, availableAt = null }) {
  const p = await getPool();
  if (!p) {
    const existing = [...mem.catalogJobs.values()].find((job) => job.idempotencyKey === idempotencyKey);
    if (existing) return { ...existing };
    const row = { id: randomUUID(),connectionId,kind,status:"pending",idempotencyKey,payload,checkpoint:{},attempts:0,maxAttempts:8,availableAt:availableAt || new Date().toISOString(),createdAt:new Date().toISOString() };
    mem.catalogJobs.set(row.id, row); return { ...row };
  }
  const { rows } = await p.query(
    `INSERT INTO catalog_jobs (connection_id,kind,idempotency_key,payload,available_at)
     VALUES ($1,$2,$3,$4,COALESCE($5,now()))
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
     RETURNING *`, [connectionId,kind,idempotencyKey,JSON.stringify(payload),availableAt]);
  return rows[0];
}

export async function claimCatalogJobs(workerId, { limit = 5, leaseMs = 60_000 } = {}) {
  const cap = Math.max(1, Math.min(20, Number(limit) || 5));
  const p = await getPool();
  if (!p) {
    const now = Date.now(), out = [];
    for (const job of [...mem.catalogJobs.values()].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt))) {
      const expiredRun = job.status === "running" && new Date(job.leaseExpiresAt || 0).getTime() <= now;
      const ready = ["pending","retry"].includes(job.status) && new Date(job.availableAt).getTime() <= now;
      if ((expiredRun || ready) && job.attempts >= job.maxAttempts) { job.status="failed"; job.lastError="lease expired after maximum attempts"; continue; }
      if (out.length >= cap || !(expiredRun || ready)) continue;
      job.status="running"; job.leaseOwner=workerId; job.leaseExpiresAt=new Date(now+leaseMs).toISOString(); job.attempts++;
      out.push({ ...job });
    }
    return out;
  }
  await p.query(
    `UPDATE catalog_jobs SET status='failed',last_error='lease expired after maximum attempts',
       lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
     WHERE status='running' AND lease_expires_at<now() AND attempts>=max_attempts`);
  const { rows } = await p.query(
    `WITH picked AS (
       SELECT id FROM catalog_jobs
       WHERE attempts<max_attempts AND (
         (status IN ('pending','retry') AND available_at<=now()) OR
         (status='running' AND lease_expires_at<now())
       )
       ORDER BY available_at,created_at LIMIT $2 FOR UPDATE SKIP LOCKED
     )
     UPDATE catalog_jobs j SET status='running',lease_owner=$1,
       lease_expires_at=now()+($3::text || ' milliseconds')::interval,
       attempts=j.attempts+1,updated_at=now()
     FROM picked WHERE j.id=picked.id RETURNING j.*`, [workerId,cap,Math.max(1000,leaseMs)]);
  return rows;
}

export async function finishCatalogJob(id, workerId, { status = "completed", checkpoint = {}, error = null, retryAt = null } = {}) {
  if (!new Set(["completed","failed","retry","canceled"]).has(status)) throw new TypeError("invalid terminal job status");
  const p = await getPool();
  if (!p) {
    const job = mem.catalogJobs.get(id);
    if (!job || job.leaseOwner !== workerId) return false;
    Object.assign(job,{status,checkpoint,lastError:error,availableAt:retryAt || job.availableAt,leaseOwner:null,leaseExpiresAt:null,completedAt:status==="completed"?new Date().toISOString():null});
    return true;
  }
  const result = await p.query(
    `UPDATE catalog_jobs SET status=$3,checkpoint=$4,last_error=$5,
       available_at=COALESCE($6,available_at),lease_owner=NULL,lease_expires_at=NULL,
       completed_at=CASE WHEN $3='completed' THEN now() ELSE NULL END,updated_at=now()
     WHERE id=$1 AND lease_owner=$2`, [id,workerId,status,JSON.stringify(checkpoint),error,retryAt]);
  return result.rowCount === 1;
}

export async function recordWebhookDelivery(input) {
  const p = await getPool();
  if (!p) {
    if (mem.webhookDeliveries.has(input.deliveryId)) return false;
    mem.webhookDeliveries.set(input.deliveryId, { ...input, receivedAt: new Date().toISOString() }); return true;
  }
  const result = await p.query(
    `INSERT INTO shopify_webhook_deliveries
      (delivery_id,connection_id,shop_domain,topic,source_object_id,source_updated_at,safe_payload,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (delivery_id) DO NOTHING`,
    [input.deliveryId,input.connectionId,input.shopDomain,input.topic,input.sourceObjectId || null,
      input.sourceUpdatedAt || null,JSON.stringify(input.safePayload || {}),input.expiresAt]
  );
  return result.rowCount === 1;
}

export async function quarantineListing({ connectionId = null, sourceKey, sourceListingId = null, reasonCodes, payloadDigest = null, expiresAt }) {
  const p = await getPool();
  if (!p) return push(mem.catalogQuarantine, { id: randomUUID(),connectionId,sourceKey,sourceListingId,reasonCodes,payloadDigest,expiresAt,createdAt:new Date().toISOString() });
  const { rows } = await p.query(
    `INSERT INTO catalog_quarantine (connection_id,source_key,source_listing_id,reason_codes,payload_digest,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [connectionId,sourceKey,sourceListingId,JSON.stringify(reasonCodes),payloadDigest,expiresAt]);
  return rows[0];
}

export async function purgeExpiredCatalogOperationalData() {
  const p = await getPool();
  if (!p) {
    const now = Date.now();
    for (const [key, row] of mem.oauthStates) if (new Date(row.expiresAt).getTime() <= now) mem.oauthStates.delete(key);
    for (const [key, row] of mem.webhookDeliveries) if (new Date(row.expiresAt).getTime() <= now) mem.webhookDeliveries.delete(key);
    mem.catalogQuarantine = mem.catalogQuarantine.filter((row) => new Date(row.expiresAt).getTime() > now);
    for (const item of coreMem.items.values()) {
      if (item.expires_at && new Date(item.expires_at).getTime() <= now && item.is_available) {
        Object.assign(item, { is_available:false,availability_status:"unknown" });
      }
    }
    return true;
  }
  await p.query("DELETE FROM shopify_oauth_states WHERE expires_at<=now()");
  await p.query("DELETE FROM shopify_webhook_deliveries WHERE expires_at<=now()");
  await p.query("DELETE FROM catalog_quarantine WHERE expires_at<=now()");
  await p.query(
    `UPDATE items SET is_available=false,availability_status='unknown',updated_at=now()
     WHERE expires_at<=now() AND is_available`);
  return true;
}

export async function saveCatalogVariants(connectionId, itemId, variants = []) {
  const clean = variants.filter((variant) => variant?.id && variant?.source_variant_id).slice(0, 1000);
  const p = await getPool();
  if (!p) {
    for (const variant of clean) mem.catalogVariants.set(variant.id, { ...variant, connectionId, itemId });
    return clean.length;
  }
  if (!clean.length) return 0;
  await p.query(
    `INSERT INTO catalog_variants
      (id,item_id,connection_id,source_variant_id,title,options,amount_minor,currency,
       availability,inventory_policy,source_updated_at,availability_checked_at)
     SELECT id,item_id,$2::uuid,source_variant_id,title,COALESCE(options,'[]'::jsonb),
       amount_minor,currency,availability,inventory_policy,source_updated_at,availability_checked_at
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text,item_id text,source_variant_id text,title text,options jsonb,amount_minor numeric,
       currency text,availability text,inventory_policy text,source_updated_at timestamptz,
       availability_checked_at timestamptz)
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,options=EXCLUDED.options,
       amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,
       availability=EXCLUDED.availability,inventory_policy=EXCLUDED.inventory_policy,
       source_updated_at=EXCLUDED.source_updated_at,
       availability_checked_at=EXCLUDED.availability_checked_at,updated_at=now()
     WHERE catalog_variants.source_updated_at IS NULL OR EXCLUDED.source_updated_at IS NULL
       OR EXCLUDED.source_updated_at >= catalog_variants.source_updated_at`,
    [JSON.stringify(clean.map((variant) => ({ ...variant, item_id: itemId }))), connectionId]
  );
  return clean.length;
}

export async function recordCatalogSyncSeen(syncRunId, connectionId, itemIds = []) {
  const ids = [...new Set(itemIds.filter(Boolean))];
  const p = await getPool();
  if (!p) {
    for (const id of ids) mem.catalogSyncSeen.add(`${syncRunId}|${id}`);
    return ids.length;
  }
  if (!ids.length) return 0;
  const result = await p.query(
    `INSERT INTO catalog_sync_seen (sync_run_id,connection_id,item_id)
     SELECT $1::uuid,$2::uuid,unnest($3::text[])
     ON CONFLICT (sync_run_id,item_id) DO NOTHING`, [syncRunId,connectionId,ids]);
  return result.rowCount;
}

export async function reconcileCatalogSnapshot(connectionId, syncRunId) {
  const p = await getPool();
  if (!p) {
    let removed = 0;
    for (const item of coreMem.items.values()) {
      if (item.connection_id !== connectionId || !item.is_available || mem.catalogSyncSeen.has(`${syncRunId}|${item.id}`)) continue;
      Object.assign(item, { is_available:false,availability_status:"removed",availability_checked_at:new Date().toISOString() });
      removed++;
    }
    for (const key of [...mem.catalogSyncSeen]) if (key.startsWith(`${syncRunId}|`)) mem.catalogSyncSeen.delete(key);
    return { removed };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query(
      `UPDATE items i SET is_available=false,availability_status='removed',
         availability_checked_at=now(),updated_at=now()
       WHERE i.connection_id=$1::text AND i.is_available=true
         AND NOT EXISTS (
           SELECT 1 FROM catalog_sync_seen s
           WHERE s.sync_run_id=$2::uuid AND s.connection_id=$1::uuid AND s.item_id=i.id
         ) RETURNING i.id`, [connectionId,syncRunId]);
    await client.query("DELETE FROM catalog_sync_seen WHERE sync_run_id=$1::uuid", [syncRunId]);
    await client.query("COMMIT");
    return { removed: removed.rowCount };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function markConnectionListingRemoved(connectionId, sourceProductId, sourceUpdatedAt = null) {
  const p = await getPool();
  if (!p) {
    let changed = 0;
    for (const item of coreMem.items.values()) {
      if (item.connection_id !== connectionId || item.source_product_id !== sourceProductId) continue;
      if (sourceUpdatedAt && item.source_updated_at && new Date(sourceUpdatedAt) < new Date(item.source_updated_at)) continue;
      Object.assign(item, { is_available:false,availability_status:"removed",availability_checked_at:new Date().toISOString(),source_updated_at:sourceUpdatedAt || item.source_updated_at });
      changed++;
    }
    return changed;
  }
  const result = await p.query(
    `UPDATE items SET is_available=false,availability_status='removed',
       availability_checked_at=now(),source_updated_at=COALESCE($3,source_updated_at),updated_at=now()
     WHERE connection_id=$1::text AND source_product_id=$2
       AND ($3::timestamptz IS NULL OR source_updated_at IS NULL OR $3::timestamptz>=source_updated_at)`,
    [connectionId,sourceProductId,sourceUpdatedAt]);
  return result.rowCount;
}
