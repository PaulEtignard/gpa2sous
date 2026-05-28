import { extractMerchantKeyword } from "@/lib/merchant";

export interface SubscriptionCandidate {
  descriptionPattern: string;
  exampleDescription: string;
  occurrenceCount: number;
  avgAmount: number;
  currency: string;
  lastChargedAt: string;
  nextExpectedAt: string;
  periodDays: number;
}

interface TxInput {
  booked_at: string;
  description: string;
  amount: number;
  currency: string;
}

function normalizeKey(kw: string): string {
  return kw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Maximum allowed interval deviation per period type (in days).
// "A subscription can be 2 days late" → use 5d for monthly (covers weekends, bank delays).
const INTERVAL_TOLERANCE: Record<number, number> = {
  7: 2,    // weekly:  ±2 days
  30: 5,   // monthly: ±5 days
  365: 20, // annual:  ±20 days (bank batching, renewal date drift)
};

export function detectSubscriptions(transactions: TxInput[]): SubscriptionCandidate[] {
  // Group debits by normalized merchant keyword
  const groups = new Map<string, TxInput[]>();
  for (const tx of transactions) {
    if (Number(tx.amount) >= 0) continue;
    const kw = extractMerchantKeyword(tx.description);
    if (!kw) continue;
    const key = normalizeKey(kw);
    if (key.length < 3) continue;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [, txs] of groups) {
    if (txs.length < 2) continue;

    const sortedAll = [...txs].sort((a, b) => a.booked_at.localeCompare(b.booked_at));

    // ── Amount filtering — keep only rows close to the current price ──────
    // True subscriptions have a stable price BUT can change once or twice
    // over time (promo → standard, annual hike, plan switch). Some banks
    // also issue one-off pro-rata credits/refunds that look unrelated.
    // We use the median amount as the reference and keep only transactions
    // within ±15 % of it. This survives a single price change without losing
    // the subscription, while still rejecting variable-spend merchants
    // (e.g. food orders, fuel) where median is meaningless.
    const allAmounts = sortedAll.map((t) => Math.abs(Number(t.amount)));
    const medAmount = median(allAmounts);
    if (medAmount <= 0) continue;

    const inRange = (a: number) => Math.abs(a - medAmount) / medAmount <= 0.15;
    const sorted = sortedAll.filter((t) => inRange(Math.abs(Number(t.amount))));

    // Need at least 2 stable-price occurrences AND ≥ 60 % of all hits at this
    // merchant must match the dominant price (rejects "noisy" merchants).
    if (sorted.length < 2) continue;
    if (sorted.length / sortedAll.length < 0.6) continue;

    // ── Interval analysis on the stable subset ────────────────────────────
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round(
        (new Date(sorted[i].booked_at).getTime() - new Date(sorted[i - 1].booked_at).getTime()) /
          86_400_000,
      );
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) continue;

    const medianInterval = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

    let periodDays: number;
    if (medianInterval >= 6 && medianInterval <= 9) periodDays = 7;
    else if (medianInterval >= 20 && medianInterval <= 45) periodDays = 30;
    else if (medianInterval >= 300 && medianInterval <= 400) periodDays = 365;
    else continue;

    if (periodDays === 7 && sorted.length < 4) continue;

    const tolerance = INTERVAL_TOLERANCE[periodDays];

    // Allow ONE off-tolerance interval (handles plan changes mid-cycle
    // and bank-side date drift). Reject only when ≥ 2 intervals deviate.
    const offCount = intervals.filter((v) => Math.abs(v - periodDays) > tolerance).length;
    if (offCount >= 2) continue;
    if (offCount >= 1 && intervals.length < 3) continue;

    if (stddev(intervals) > tolerance * 1.0) continue;

    // ── Build candidate using only the stable subset ───────────────────────
    const amounts = sorted.map((t) => Math.abs(Number(t.amount)));
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;

    const last = sorted[sorted.length - 1];
    const nextDate = new Date(new Date(last.booked_at).getTime() + periodDays * 86_400_000);
    const kw = extractMerchantKeyword(last.description)!;

    candidates.push({
      descriptionPattern: normalizeKey(kw),
      exampleDescription: last.description,
      occurrenceCount: sorted.length,
      avgAmount: Math.round(avgAmount * 100) / 100,
      currency: last.currency ?? "EUR",
      lastChargedAt: last.booked_at,
      nextExpectedAt: nextDate.toISOString().slice(0, 10),
      periodDays,
    });
  }

  return candidates.sort((a, b) => b.avgAmount - a.avgAmount);
}
