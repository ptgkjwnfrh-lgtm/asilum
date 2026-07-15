// Shared URL guard for anything rendered as a link or persisted from a source.
// ASILUM never needs executable/data URLs, private-network destinations, or
// nonstandard ports; production source links must use public TLS endpoints.
export function isPublicHostname(value) {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal")) return false;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const octets = host.split(".").map(Number);
    if (octets.some((part) => part < 0 || part > 255)) return false;
    const [a, b] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  if (host.includes(":")) {
    if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return false;
    const first = Number.parseInt(host.split(":", 1)[0] || "0", 16);
    if ((first & 0xffc0) === 0xfe80) return false; // IPv6 link-local fe80::/10
    if (host.startsWith("::ffff:")) return isPublicHostname(host.slice(7));
  }
  return true;
}

export function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        (url.port && url.port !== "443") || !isPublicHostname(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  return safeExternalUrl(value);
}
