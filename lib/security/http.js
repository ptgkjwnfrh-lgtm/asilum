const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

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

export async function readJsonResponse(response, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json\b/.test(type)) {
    throw new TypeError("upstream did not return JSON");
  }
  const bytes = await readBytes(response, maxBytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function readResponseSnippet(response, maxBytes = 512) {
  try {
    const bytes = await readBytes(response, maxBytes);
    return new TextDecoder().decode(bytes).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
