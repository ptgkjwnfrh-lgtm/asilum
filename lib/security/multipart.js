// Bounded multipart reader for upload routes. Request.formData() buffers the
// entire body, so consume the stream under an explicit cap before parsing.

class MultipartRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Parse a multipart upload under a byte cap, or produce the error response.
 *
 * Same contract as readJsonRequest in json.js — returns `{ body }` or
 * `{ response }`, and THE CALLER MUST RETURN `response` WHEN PRESENT.
 *
 * `maxBytes` is required here rather than defaulted, because an upload ceiling
 * belongs to the route that knows what it accepts; a shared default would end
 * up sized for the largest caller and silently apply to the smallest.
 *
 * The declared Content-Length is checked first as a cheap rejection, but the
 * running total is what enforces the limit — a sender can omit or understate
 * the header, so it is a hint, never the control.
 */
export async function readMultipartRequest(req, { maxBytes }) {
  try {
    const type = (req.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("multipart/form-data;")) {
      throw new MultipartRequestError("multipart/form-data required", 415);
    }
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new MultipartRequestError("request body too large", 413);
    }
    if (!req.body) throw new MultipartRequestError("multipart body required", 400);

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
          throw new MultipartRequestError("request body too large", 413);
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
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    const bounded = new Request(req.url, { method: "POST", headers, body: bytes });
    return { form: await bounded.formData(), response: null };
  } catch (error) {
    const status = error instanceof MultipartRequestError ? error.status : 400;
    const message = error instanceof MultipartRequestError ? error.message : "multipart body could not be read";
    return { form: null, response: Response.json({ error: message }, { status }) };
  }
}
