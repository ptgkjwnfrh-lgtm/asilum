// lib/supabase.js
// Supabase auth client factory. The app must run fully without Supabase
// (constitution: nothing fake, no crashes on missing keys), so:
//   - authConfigured() is false until NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are
//     set in .env.local (see .env.example) and the app is rebuilt;
//   - the supabase-js bundle is imported dynamically ONLY when configured,
//     so unconfigured builds never load it.
// Client-safe: anon key only; the service-role key must never appear here.

let _clientPromise = null;

/** Are the Supabase URL and anon key present? Sign-in surfaces say they are
 *  unavailable rather than failing at the call when this is false. */
export function authConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Resolves to a Supabase client, or null when not configured.
export function getSupabase() {
  if (!authConfigured()) return Promise.resolve(null);
  if (!_clientPromise) {
    _clientPromise = import("@supabase/supabase-js").then((m) =>
      m.createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    );
  }
  return _clientPromise;
}

// Server-side verification for routes that mutate account-owned data.
export async function getAuthenticatedUser(req) {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const client = await getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(match[1]);
  return error ? null : data?.user || null;
}
