// Client/server shared garment-photo limits. Keep this module dependency-free
// so browser code never pulls the server-only Storage or Postgres layers into
// its bundle.
export const PHOTO_CONSENT_VERSION = "wardrobe-photo-v1-2026-07";
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_REQUEST_MAX_BYTES = PHOTO_MAX_BYTES + 128 * 1024;
export const SIGNED_PHOTO_URL_TTL_SECONDS = 300;
