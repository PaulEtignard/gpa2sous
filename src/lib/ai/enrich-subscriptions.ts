import { callOpenRouter } from "./openrouter";

export interface SubscriptionToEnrich {
  id: string;
  exampleDescription: string;
}

export interface EnrichedSubscription {
  id: string;
  displayName: string;
  domain: string | null;
  logoUrl: string | null;
}

async function resolveLogoUrl(domain: string): Promise<string | null> {
  // Try Clearbit first (high-quality brand logos)
  const clearbit = `https://logo.clearbit.com/${domain}`;
  try {
    const resp = await fetch(clearbit, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (resp.ok && (resp.headers.get("content-type") ?? "").startsWith("image/")) {
      return clearbit;
    }
  } catch {
    // network error or timeout
  }

  // Fallback: Google S2 favicons (always returns an image)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

export async function enrichSubscriptions(
  subscriptions: SubscriptionToEnrich[],
): Promise<EnrichedSubscription[]> {
  if (subscriptions.length === 0) return [];

  const lines = subscriptions.map((s, i) => `${i}|${s.exampleDescription}`).join("\n");

  const prompt = `Identify the company/service name and website domain for each subscription transaction.
These are French bank account transactions (prélèvements SEPA / virements).

TRANSACTIONS (index|raw bank description):
${lines}

Reply with exactly ${subscriptions.length} lines in this format:
index|Company Display Name|domain.com

Rules:
- Use the well-known brand name (e.g. "Spotify", "Netflix", "Amazon Prime")
- Domain must be the root domain only (e.g. "spotify.com", "netflix.com", "amazon.fr")
- Write null as the domain when it is a personal payment or truly unknown
- No explanations, no empty lines, no extra text

French services reference (use these exact domains):
ALMA / ALMA PAY → almapay.com | FREE / FREE MOBILE → free.fr | ORANGE → orange.fr
SFR → sfr.fr | BOUYGUES → bouyguestelecom.fr | EDF → edf.fr | ENGIE → engie.com
CANAL+ → canalplus.com | MOLOTOV → molotov.tv | QONTO → qonto.com
LYDIA → lydia-app.com | PAYFIT → payfit.com | ALAN → alan.com | LUKO → luko.fr`;

  const raw = await callOpenRouter([{ role: "user", content: prompt }], {
    temperature: 0,
    maxTokens: subscriptions.length * 30 + 300,
  });

  // Parse AI response
  const aiResults: { displayName: string; domain: string | null }[] = subscriptions.map((s) => ({
    displayName: s.exampleDescription,
    domain: null,
  }));

  for (const line of raw.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length < 3) continue;
    const idx = parseInt(parts[0]);
    if (isNaN(idx) || idx < 0 || idx >= subscriptions.length) continue;
    const displayName = parts[1]?.trim();
    const rawDomain = parts[2]?.trim().toLowerCase();
    const isNull = !rawDomain || /^(null|none|unknown|n\/a|na|-)$/.test(rawDomain);
    aiResults[idx] = {
      displayName: displayName || subscriptions[idx].exampleDescription,
      domain: isNull ? null : rawDomain,
    };
  }

  // Resolve logo URLs server-side (so client never needs a fallback)
  const results = await Promise.all(
    aiResults.map(async (r, i) => ({
      id: subscriptions[i].id,
      displayName: r.displayName,
      domain: r.domain,
      logoUrl: r.domain ? await resolveLogoUrl(r.domain) : null,
    })),
  );

  return results;
}
