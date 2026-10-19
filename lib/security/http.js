// lib/security/http.js — READING A RESPONSE FROM SOMEWHERE ELSE, safely.
//
// An upstream response is untrusted input in a way that is easy to forget,
// because it usually arrives from a service we chose. The specific danger is
// not malice but SIZE: `await response.json()` buffers whatever the other end
// sends, with no ceiling, so one upstream having a bad day — or a redirect
// landing on something enormous — becomes memory exhaustion here.
//
// Everything in this file therefore reads with a byte budget and gives up
// when it is exceeded, rather than trusting Content-Length, which is a claim
// the sender makes and can simply omit. The declared length is checked as a
// cheap early exit; the running total is what actually enforces the limit.

/** Ceiling for a single upstream read. Generous for JSON, fatal for a stream. */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Read a response body into memory, refusing to exceed `maxBytes`.
 *
 * Throws RangeError on an over-large body — including one whose declared
 * Content-Length is already too big, which avoids reading a single byte of it.
 * The reader is cancelled on every exit path so a refused stream does not stay
 * open holding the socket.
 *
 * Returns an empty array for a body-less response rather than throwing, so
 * callers can treat 204 as ordinary.
 */
export async function readBytes(response, maxBytes = DEFAULT_MAX_BYTES) {
  if (!response.body) return new Uint8Array();
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RangeError("upstream response too large");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new RangeError("upstream response too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Parse an upstream JSON response, size-capped.
 *
 * Use this instead of `response.json()` everywhere. Besides the byte ceiling
 * it insists the content type really is JSON, so an HTML error page or a login
 * redirect fails with a clear TypeError rather than a parse error somewhere
 * further down that reads like corrupt data. The pattern accepts `+json`
 * suffixed types, which real APIs do use.
 */
export async function readJsonResponse(response, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json\b/.test(type)) {
    throw new TypeError("upstream did not return JSON");
  }
  const bytes = await readBytes(response, maxBytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * A short, single-line excerpt of a response body, for log and error messages.
 *
 * Never throws — a diagnostic that can fail turns a handled upstream error
 * into an unhandled one, right where someone is trying to find out what went
 * wrong. On any failure it returns "" and the caller reports what it already
 * knew.
 */
export async function readResponseSnippet(response, maxBytes = 512) {
  try {
    const bytes = await readBytes(response, maxBytes);
    return new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
