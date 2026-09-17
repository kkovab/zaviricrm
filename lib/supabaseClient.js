"use client";

import { createClient } from "@supabase/supabase-js";

// This client uses the public ANON key, not the service role key - it only
// ever reads (for the live-sync subscription below), never writes. All
// actual saves still go through the /api/* routes, which use the service
// role key on the server and stay behind the password gate. This client is
// only for getting notified the instant something changes in the database
// so we know to refetch.
let client = null;

export function supabaseClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Live sync just won't be available - the app still works fine without
    // it, callers should treat a null return as "skip realtime."
    return null;
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
