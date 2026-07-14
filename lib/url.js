// Shared URL guard for anything rendered as a link or persisted from a source.
// ASILUM never needs executable/data URLs; production source links must use TLS.
export function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  return safeExternalUrl(value);
}
