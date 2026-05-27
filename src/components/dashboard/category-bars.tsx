import { formatCurrency } from "@/lib/utils";

interface CategoryItem {
  name: string;
  color: string;
  total: number;
}

export function CategoryBars({ data }: { data: CategoryItem[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aucune dépense ce mois.
      </p>
    );
  }

  const max   = Math.max(...data.map((d) => d.total), 1);
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const barPct     = (item.total / max) * 100;
        const totalPct   = ((item.total / total) * 100).toFixed(0);

        return (
          <div key={item.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-sm font-medium">{item.name}</span>
              </div>
              <div className="flex shrink-0 items-baseline gap-1.5">
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(item.total)}
                </span>
                <span className="text-[11px] text-muted-foreground">{totalPct}%</span>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${barPct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
