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
    const [a, b, c] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (host.includes(":")) {
    // Reject unspecified/loopback/IPv4-compatible and mapped forms. Mapped
    // literals are commonly rendered as ::ffff:7f00:1, not dotted IPv4, and
    // must not bypass the private IPv4 checks above.
    if (host.startsWith("::")) return false;
    const [firstRaw = "0", secondRaw = "0"] = host.split(":");
    const first = Number.parseInt(firstRaw, 16);
    const second = Number.parseInt(secondRaw, 16);
    if (!Number.isInteger(first) || !Number.isInteger(second)) return false;
    if ((first & 0xfe00) === 0xfc00 || // unique-local fc00::/7
        (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
        (first & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
        (first & 0xff00) === 0xff00 || // multicast ff00::/8
        (first === 0x64 && second === 0xff9b) || // NAT64 transition prefixes
        first === 0x2002 || // 6to4 embeds an IPv4 destination
        (first === 0x2001 && (second === 0 || second === 2 || second === 0xdb8 ||
          (second >= 0x10 && second <= 0x1f)))) return false;
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
