"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

interface Props {
  dailyData: { day: number; value: number }[];
  net: number;
  income: number;
  expense: number;
  prevNet: number;
  month: string;
}

export function HeroChart({ dailyData, net, income, expense, prevNet, month }: Props) {
  const isPositive = net >= 0;
  const accentHex  = isPositive ? "#3b82f6" : "#f87171";
  const accentBg   = isPositive ? "rgba(59,130,246,0.14)"  : "rgba(248,113,113,0.14)";
  const accentText = isPositive ? "#93c5fd" : "#fca5a5";

  const diff    = net - prevNet;
  const diffPct = prevNet !== 0 ? (diff / Math.abs(prevNet)) * 100 : null;
  const hasPrev = prevNet !== 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ background: "linear-gradient(145deg,#0c0c16 0%,#111827 100%)" }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full blur-[80px]"
        style={{ backgroundColor: accentHex, opacity: 0.18 }}
      />

      <div className="relative px-6 py-7 md:px-8 md:py-8">
        {/* Period */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {month}
        </p>

        {/* Big net number */}
        <p
          className="font-bold tracking-tight text-white"
          style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)", lineHeight: 1.1 }}
        >
          {net >= 0 ? "+" : "−"}&nbsp;{formatCurrency(Math.abs(net))}
        </p>

        {/* Comparison badge */}
        <div className="mt-2 mb-6 flex flex-wrap items-center gap-2">
          {hasPrev && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: accentBg, color: accentText }}
            >
              {diff >= 0 ? "▲" : "▼"}&nbsp;{diff >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}
              {diffPct !== null && (
                <span className="opacity-60">
                  ({diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%)
                </span>
              )}
            </span>
          )}
          <span className="text-xs text-zinc-600">vs mois précédent</span>
        </div>

        {/* Area chart */}
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accentHex} stopOpacity={0.38} />
                  <stop offset="100%" stopColor={accentHex} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#fff",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
                formatter={(v: number) => [
                  `${v >= 0 ? "+" : ""}${formatCurrency(v)}`,
                  "Net cumulé",
                ]}
                labelFormatter={(l: number) => `Jour ${l}`}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={accentHex}
                strokeWidth={2.5}
                fill="url(#heroGrad)"
                dot={false}
                activeDot={{ r: 4, fill: accentHex, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Income / Expense split row */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.05] pt-5">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Revenus
            </p>
            <p className="text-lg font-semibold text-blue-400">
              +{formatCurrency(income)}
            </p>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Dépenses
            </p>
            <p className="text-lg font-semibold text-red-400">
              {formatCurrency(Math.abs(expense))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
