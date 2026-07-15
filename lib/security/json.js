const DEFAULT_MAX_BYTES = 64 * 1024;

class JsonRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "JsonRequestError";
    this.status = status;
  }
}

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

// App Router does not impose a useful per-route JSON limit. Consume the body
// stream only up to a byte cap so public mutation endpoints cannot make the
// server buffer or parse an arbitrarily large body. Requiring JSON also keeps
// cookie-authenticated anonymous writes outside the browser's "simple request"
// CSRF envelope.
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
