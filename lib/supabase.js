// lib/supabase.js
// Supabase auth client factory. The app must run fully without Supabase
// (constitution: nothing fake, no crashes on missing keys), so:
//   - authConfigured() is false until NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are
//     set in .env.local (see .env.example) and the app is rebuilt;
//   - the supabase-js bundle is imported dynamically ONLY when configured,
//     so unconfigured builds never load it.
// Client-safe: anon key only; the service-role key must never appear here.

let _clientPromise = null;

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
