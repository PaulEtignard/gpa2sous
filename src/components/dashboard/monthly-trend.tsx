"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export function MonthlyTrendChart({
  data,
}: {
  data: { month: string; income: number; expense: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Pas assez de données.
      </p>
    );
  }

  const formatted = data.map((d) => {
    const [y, m] = d.month.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "short",
    });
    return { ...d, label };
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart
          data={formatted}
          barGap={2}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 0"
            vertical={false}
            stroke="hsl(var(--border))"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
            width={36}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
          />
          <Bar
            dataKey="income"
            name="Revenus"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="expense"
            name="Dépenses"
            fill="#f87171"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
