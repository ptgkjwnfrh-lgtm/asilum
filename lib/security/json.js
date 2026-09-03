// lib/security/json.js — READING A REQUEST BODY FROM A BROWSER, safely.
//
// The mirror of http.js: that file bounds what an upstream sends US, this one
// bounds what a CLIENT sends. It is the front door for every mutating route
// and it does two jobs that look like one.
//
// 1. A BYTE CEILING. The App Router imposes no useful per-route body limit, so
//    without this a public endpoint will happily buffer and parse a body of
//    any size. The cap is enforced on the running total while streaming, not
//    on Content-Length, which the sender controls and may omit entirely.
//
// 2. A CSRF BOUNDARY, and this is the part that is easy to delete by accident.
//    Insisting on `Content-Type: application/json` puts these requests OUTSIDE
//    the browser's "simple request" envelope, so a cross-origin form or image
//    tag cannot forge one — it would need a preflight, which same-origin
//    policy will refuse. Relaxing the content-type check to "be lenient" would
//    quietly open every cookie-authenticated write in the app to CSRF.
//
// Callers get `{ body }` or `{ response }` and must return `response` when it
// is present; a route that ignores it has no limit and no CSRF boundary.

/** Ceiling for a request body. Ample for JSON; uploads use multipart.js. */
const DEFAULT_MAX_BYTES = 64 * 1024;

/** An error that already knows which HTTP status the caller should answer. */
class JsonRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "JsonRequestError";
    this.status = status;
  }
}

/**
 * Stream a request body to text, aborting past `maxBytes` with a 413.
 *
 * Cancels the reader on every exit path, including failure, so a refused body
 * does not leave the connection draining in the background.
 */
async function readBoundedText(req, maxBytes) {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new JsonRequestError("request body too large", 413);
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
  return new TextDecoder().decode(bytes);
}

/**
 * Parse a JSON request body under a byte cap, or produce the error response.
 *
 * Returns `{ body }` on success and `{ response }` on failure — 415 for a
 * non-JSON content type, 413 for an over-large body, 400 for malformed JSON.
 * THE CALLER MUST RETURN `response` WHEN IT IS PRESENT:
 *
 *     const parsed = await readJsonRequest(req);
 *     if (parsed.response) return parsed.response;
 *     const body = parsed.body;
 *
 * Skipping that check does not just lose the error — it discards the size
 * ceiling and the CSRF boundary described at the top of this file.
 *
 * See the header before loosening the content-type rule. It reads like
 * pedantry and is load-bearing.
 */
export async function readJsonRequest(req, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  try {
    const type = (req.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (type !== "application/json" && !type.endsWith("+json")) {
      throw new JsonRequestError("content-type must be application/json", 415);
    }

    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new JsonRequestError("request body too large", 413);
    }

    const text = await readBoundedText(req, maxBytes);
    if (!text.trim()) throw new JsonRequestError("JSON body required", 400);

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new JsonRequestError("invalid JSON body", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new JsonRequestError("JSON body must be an object", 400);
    }
    return { body, response: null };
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return {
        body: null,
        response: Response.json({ error: error.message }, { status: error.status }),
      };
    }
    return {
      body: null,
      response: Response.json({ error: "request body could not be read" }, { status: 400 }),
    };
  }
}

// Identity-gated JSON must never be shared-cacheable: the framework already
// marks these routes force-dynamic, but a misconfigured proxy/CDN in front
// of the app is exactly the failure this header exists for. Wrap a route
// handler; an explicit Cache-Control set inside the handler wins.
export function withPrivateCache(handler) {
  return async (...args) => {
    const response = await handler(...args);
    if (response?.headers && !response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
    }
    return response;
  };
}
