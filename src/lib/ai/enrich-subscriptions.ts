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
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

const NULL_DOMAIN = /^(null|none|unknown|n\/a|na|-)$/i;

export async function enrichSubscriptions(
  subscriptions: SubscriptionToEnrich[],
): Promise<EnrichedSubscription[]> {
  if (subscriptions.length === 0) return [];

  const lines = subscriptions.map((s, i) => `${i}: ${s.exampleDescription}`).join("\n");

  const prompt = `You are a financial data API with expert knowledge of companies worldwide.
Identify the real company or service behind each French bank transaction description.

Return ONLY a JSON array — no markdown, no explanation, nothing else.
Each object: {"i": <index>, "name": "<brand name>", "domain": "<root domain or null>"}

Examples:
[{"i":0,"name":"Spotify","domain":"spotify.com"},{"i":1,"name":"JOW","domain":"jow.fr"},{"i":2,"name":"Frais bancaires","domain":null}]

Rules:
- Use your knowledge to identify ANY company or service — do not limit yourself to a predefined list
- name: the real brand name as the public knows it (e.g. "Netflix", "Amazon Prime", "EDF")
- domain: the company's main website root domain — prefer country-specific domain when relevant (e.g. amazon.fr not amazon.com for French services)
- Set domain to null ONLY when it is a personal bank transfer or a pure bank fee with no identifiable merchant
- French bank descriptions often contain: merchant name, card number, date, reference — focus on the merchant name
- PAYLI / PAYLIB prefixes indicate a payment gateway — look at the merchant name after the slash

Transactions:
${lines}`;

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content: "You are a data extraction API. Output ONLY the JSON array requested. No prose.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0, maxTokens: subscriptions.length * 40 + 200 },
  );

  console.log("[enrich-subscriptions] raw AI response:\n", raw);

  const aiResults: { displayName: string; domain: string | null }[] = subscriptions.map((s) => ({
    displayName: s.exampleDescription,
    domain: null,
  }));

  // Primary: extract the LAST JSON array found anywhere in the response
  // (some models emit thinking text before the actual answer)
  const jsonMatches = [...raw.matchAll(/\[[\s\S]*?\]/g)];
  const lastMatch = jsonMatches.at(-1);
  let parsedFromJson = false;

  if (lastMatch) {
    try {
      const arr = JSON.parse(lastMatch[0]) as { i: number; name: string; domain: string | null }[];
      if (Array.isArray(arr) && arr.length > 0) {
        for (const item of arr) {
          const idx = item.i;
          if (typeof idx !== "number" || idx < 0 || idx >= subscriptions.length) continue;
          const domain =
            typeof item.domain === "string" && !NULL_DOMAIN.test(item.domain.trim())
              ? item.domain.trim().toLowerCase()
              : null;
          aiResults[idx] = {
            displayName: item.name?.trim() || subscriptions[idx].exampleDescription,
            domain,
          };
        }
        parsedFromJson = true;
      }
    } catch {
      // fall through to pipe parser
    }
  }

  if (!parsedFromJson) {
    // Fallback: pipe-separated format (index|name|domain)
    for (const line of raw.split("\n")) {
      const parts = line.trim().split("|");
      if (parts.length < 3) continue;
      const idx = parseInt(parts[0]);
      if (isNaN(idx) || idx < 0 || idx >= subscriptions.length) continue;
      const rawDomain = parts[2]?.trim().toLowerCase();
      aiResults[idx] = {
        displayName: parts[1]?.trim() || subscriptions[idx].exampleDescription,
        domain: !rawDomain || NULL_DOMAIN.test(rawDomain) ? null : rawDomain,
      };
    }
  }

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
