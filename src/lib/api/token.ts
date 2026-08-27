/**
 * The access token for authenticated API calls.
 *
 * Read through `getSession()` on each call rather than cached here. Supabase
 * refreshes an expired token inside that method, so a token held in a module
 * variable would go stale exactly once — for the request made after it expired —
 * and the symptom would be a spurious sign-out rather than an obvious bug.
 *
 * Returns `undefined` when there is no session. The API's authenticated routes
 * answer 401 either way, and a caller that needs a token should say so itself
 * rather than receive a placeholder.
 */
import { getSupabaseClient } from '../supabase';

export async function getAccessToken(): Promise<string | undefined> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token;
}
