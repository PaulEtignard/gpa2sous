/**
 * Resolve the Supabase URL and publishable/anon key from env vars.
 *
 * Supabase introduced a new "publishable key" naming convention
 * (`sb_publishable_*`) in 2025; older projects still use the JWT-style "anon
 * key". We accept either env-var name so the same code works for both.
 */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL est manquant dans .env.local");
  }
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) est manquant dans .env.local",
    );
  }

  return { url, key };
}
