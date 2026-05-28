/**
 * Merchant knowledge-base lookup.
 *
 * Before spending an AI call to identify the company behind a transaction, we
 * first try to match it against the shared `merchants` table via its aliases.
 * A merchant can have several aliases ("paypal", "pypl", …) so one company is
 * recognised whatever spelling the bank uses. When the AI discovers a merchant
 * we don't know yet, `recordMerchant` persists it so the next lookup is a free
 * DB hit instead of another AI call.
 */

import { createClient } from "@/lib/supabase/server";

export interface MerchantHit {
  merchantId: string;
  displayName: string;
  domain: string | null;
  logoUrl: string | null;
}

/**
 * Normalize a string into a comparable key: lowercase, accent-stripped, only
 * alphanumerics. Must match the normalisation used for alias patterns so a
 * description and a stored pattern compare on equal footing.
 */
export function normalizeMerchantKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Match each item's example description against known merchant aliases.
 * Returns a map keyed by the item's `id`. A miss simply has no entry.
 *
 * Matching is substring-based on the normalized description: alias "paypal"
 * matches a description that normalizes to "…paypaleur123…". Longer aliases
 * are tried first so the most specific merchant wins.
 */
export async function lookupMerchantsForExamples(
  items: { id: string; example: string }[],
): Promise<Map<string, MerchantHit>> {
  const out = new Map<string, MerchantHit>();
  if (items.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase
    .from("merchant_aliases")
    .select("pattern, merchant_id, merchants(display_name, domain, logo_url)");

  type Row = {
    pattern: string;
    merchant_id: string;
    merchants:
      | { display_name: string; domain: string | null; logo_url: string | null }
      | { display_name: string; domain: string | null; logo_url: string | null }[]
      | null;
  };

  const aliases = ((data ?? []) as Row[])
    .filter((a) => a.pattern && a.pattern.length >= 3)
    .sort((a, b) => b.pattern.length - a.pattern.length);

  for (const item of items) {
    const hay = normalizeMerchantKey(item.example);
    if (!hay) continue;
    const match = aliases.find((a) => hay.includes(a.pattern.toLowerCase()));
    if (!match) continue;
    const m = Array.isArray(match.merchants) ? match.merchants[0] : match.merchants;
    if (!m) continue;
    out.set(item.id, {
      merchantId: match.merchant_id,
      displayName: m.display_name,
      domain: m.domain,
      logoUrl: m.logo_url,
    });
  }

  return out;
}

/**
 * Persist a merchant discovered by the AI so future lookups skip the AI call.
 * De-duplicates by domain (when present) and never inserts a duplicate alias.
 * Only call this for identifiable merchants — skip pure bank fees / transfers
 * (domain === null) which would pollute the shared table.
 */
export async function recordMerchant(args: {
  displayName: string;
  domain: string | null;
  logoUrl: string | null;
  alias: string;
}): Promise<void> {
  const alias = normalizeMerchantKey(args.alias);
  if (alias.length < 3) return;

  const supabase = await createClient();

  // Alias already known → nothing to do.
  const { data: existingAlias } = await supabase
    .from("merchant_aliases")
    .select("id")
    .eq("pattern", alias)
    .maybeSingle();
  if (existingAlias) return;

  // Reuse an existing merchant with the same domain, else create one.
  let merchantId: string | null = null;
  if (args.domain) {
    const { data: existing } = await supabase
      .from("merchants")
      .select("id")
      .eq("domain", args.domain)
      .maybeSingle();
    merchantId = existing?.id ?? null;
  }

  if (!merchantId) {
    const { data: created } = await supabase
      .from("merchants")
      .insert({
        display_name: args.displayName,
        domain: args.domain,
        logo_url: args.logoUrl,
        source: "ai",
      })
      .select("id")
      .single();
    merchantId = created?.id ?? null;
  }

  if (merchantId) {
    await supabase.from("merchant_aliases").insert({ merchant_id: merchantId, pattern: alias });
  }
}
