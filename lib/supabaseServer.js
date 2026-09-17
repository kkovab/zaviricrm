import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key, which has full access to the
// database and bypasses Row Level Security. It must only ever be used
// inside server-side code (API routes) - never imported into a component
// that runs in the browser, and the key must never be prefixed with
// NEXT_PUBLIC_.
let client = null;

export function supabaseServer() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
