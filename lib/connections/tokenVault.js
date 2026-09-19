// lib/connections/tokenVault.js — server-only encryption for provider tokens.
// The master key comes from the environment/KMS injection boundary and is
// never stored beside ciphertext. Callers bind ciphertext to connection+field
// through authenticated additional data, so swapping two columns fails.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function decodeKey(encoded) {
  if (!encoded) return null;
  let key;
  try { key = Buffer.from(encoded, "base64"); } catch { return null; }
  return key.length === 32 ? key : null;
}

function keyFromEnvironment(version = (process.env.CATALOG_TOKEN_KEY_VERSION || "").trim()) {
  const currentVersion = (process.env.CATALOG_TOKEN_KEY_VERSION || "").trim();
  if (version === currentVersion) return decodeKey(process.env.CATALOG_TOKEN_KEY || "");
  try {
    const previous = JSON.parse(process.env.CATALOG_TOKEN_PREVIOUS_KEYS || "{}");
    return previous && typeof previous === "object" ? decodeKey(previous[version]) : null;
  } catch { return null; }
}

export function tokenVaultConfigured() {
  return Boolean(keyFromEnvironment() && (process.env.CATALOG_TOKEN_KEY_VERSION || "").trim());
}

export function encryptProviderToken(token, { connectionRef, field }) {
  if (typeof token !== "string" || !token) throw new TypeError("provider token is required");
  const key = keyFromEnvironment((process.env.CATALOG_TOKEN_KEY_VERSION || "").trim());
  const version = (process.env.CATALOG_TOKEN_KEY_VERSION || "").trim();
  if (!key || !version) throw new Error("catalog token encryption is not configured");
  const iv = randomBytes(12);
  const aad = Buffer.from(`${connectionRef}:${field}`);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", version, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptProviderToken(ciphertext, { connectionRef, field }) {
  const [format, version, ivRaw, tagRaw, bodyRaw, extra] = String(ciphertext || "").split(".");
  if (format !== "v1" || !version || !ivRaw || !tagRaw || !bodyRaw || extra) throw new Error("provider token ciphertext is invalid");
  const key = keyFromEnvironment(version);
  if (!key) throw new Error(`provider token key version ${version} is unavailable`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(`${connectionRef}:${field}`));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyRaw, "base64url")), decipher.final()]).toString("utf8");
}
