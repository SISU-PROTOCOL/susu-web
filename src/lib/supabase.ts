import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

/**
 * Supabase client for the browser.
 *
 * SECURITY: this client is constructed with the publishable/anon key only. The
 * frontend must never receive a service-role key, secret key, or database
 * password — `src/lib/env.ts` refuses to start if one is present.
 *
 * Never import server-side credentials into this module.
 */

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client === undefined) {
    const env = getEnv();
    client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
