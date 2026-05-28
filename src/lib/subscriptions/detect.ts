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

    const sorted = [...txs].sort((a, b) => a.booked_at.localeCompare(b.booked_at));

    // Compute day-intervals between consecutive occurrences
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

    // Classify as weekly / monthly / annual
    let periodDays: number;
    if (medianInterval >= 6 && medianInterval <= 9) periodDays = 7;
    else if (medianInterval >= 20 && medianInterval <= 45) periodDays = 30;
    else if (medianInterval >= 300 && medianInterval <= 400) periodDays = 365;
    else continue;

    // Minimum occurrences (weekly needs more data to be reliable)
    if (periodDays === 7 && sorted.length < 4) continue;

    const tolerance = INTERVAL_TOLERANCE[periodDays];

    // ── Strict interval check ──────────────────────────────────────────────
    // ALL intervals must be within ±tolerance of the nominal period.
    // This rejects irregular purchases (e.g. food orders that happen monthly
    // but not on a fixed schedule).
    const allIntervalsConsistent = intervals.every(
      (v) => Math.abs(v - periodDays) <= tolerance,
    );
    if (!allIntervalsConsistent) continue;

    // Also require low standard deviation (catches cases where two extreme
    // outliers cancel each other out but are still irregular).
    if (stddev(intervals) > tolerance * 0.8) continue;

    // ── Strict amount check ────────────────────────────────────────────────
    // True subscriptions have a fixed price. Allow a small tolerance for
    // annual price increases (e.g. Netflix going from €13.99 to €15.99).
    // This rejects variable-amount purchases like food orders.
    const amounts = sorted.map((t) => Math.abs(Number(t.amount)));
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const mad = amounts.reduce((s, v) => s + Math.abs(v - avgAmount), 0) / amounts.length;
    if (mad > avgAmount * 0.10) continue; // > 10 % variance → not a subscription

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
