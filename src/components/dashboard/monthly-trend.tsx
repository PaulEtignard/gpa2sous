"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

export function MonthlyTrendChart({
  data,
}: {
  data: { month: string; income: number; expense: number }[];
}) {
  if (data.length === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Pas assez de données.</div>;
  }

  const formatted = data.map((d) => {
    const [y, m] = d.month.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "short",
      year: "2-digit",
    });
    return { ...d, label };
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Revenus" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Dépenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
