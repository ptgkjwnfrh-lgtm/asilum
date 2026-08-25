// Shared URL guard for anything rendered as a link or persisted from a source.
// ASILUM never needs executable/data URLs, private-network destinations, or
// nonstandard ports; production source links must use public TLS endpoints.
// Put a hostname into the exact shape `new URL(...).hostname` produces, so the
// checks below see one canonical form. Every caller in the repo already passes
// `url.hostname`, which made this a no-op for them and the guard correct only
// by their good manners: called with a RAW host it answered PUBLIC for
// `2130706433`, `0177.0.0.1`, `0:0:0:0:0:0:0:1` and `0:0:0:0:0:ffff:7f00:1` —
// four spellings of loopback. The parser folds all of them to the dotted or
// compressed forms the checks already reject. Idempotent, so nothing changes
// for the three existing call sites.
function canonicalHostname(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  // A bare IPv6 literal has to be bracketed or the parser reads ":" as a port.
  const bracketed = raw.includes(":") && !raw.startsWith("[") ? `[${raw}]` : raw;
  try {
    return new URL(`https://${bracketed}`).hostname;
  } catch {
    return null;  // not a hostname at all — fail closed
  }
}

/**
 * Is this hostname on the PUBLIC internet? An SSRF guard.
 *
 * Rejects loopback, private ranges, link-local, and the many spellings of
 * them — `2130706433`, `0177.0.0.1` and `0:0:0:0:0:ffff:7f00:1` are all
 * 127.0.0.1, which is why the value is canonicalised through the URL parser
 * before any check runs.
 *
 * FAILS CLOSED: anything unparseable is not public.
 */
export function isPublicHostname(value) {
  const canonical = canonicalHostname(value);
  if (canonical === null) return false;
  const host = canonical.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
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

/**
 * A URL safe to store or render as a link, or null.
 *
 * Requires https, a public host, no embedded credentials and no nonstandard
 * port. USE THIS ON EVERY URL THAT ARRIVES FROM OUTSIDE — a merchant feed, a
 * model, a form. Returning null rather than a cleaned-up string is deliberate:
 * there is no safe repair for a URL pointing somewhere it should not.
 */
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

/** Same guard, for image sources. A separate name because an image URL is
 *  rendered in a different context and may need to diverge later; today the
 *  rule is identical. */
export function safeImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  return safeExternalUrl(value);
}
