import { requireAdmin } from "@/lib/admin";

interface GlobalStats {
  users: number;
  accounts: number;
  transactions: number;
  categorized: number;
  transfers: number;
  subscriptions: number;
  merchants: number;
  aliases: number;
  rules: number;
  jobs_active: number;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase.rpc("admin_global_stats");
  const s = (data ?? {}) as Partial<GlobalStats>;

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("fr-FR");
  const catRate =
    s.transactions && s.transactions > 0
      ? Math.round(((s.categorized ?? 0) / s.transactions) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Utilisateurs" value={fmt(s.users)} />
      <StatCard label="Comptes" value={fmt(s.accounts)} />
      <StatCard label="Transactions" value={fmt(s.transactions)} hint={`${fmt(s.transfers)} virements appairés`} />
      <StatCard label="Catégorisation" value={`${catRate}%`} hint={`${fmt(s.categorized)} catégorisées`} />
      <StatCard label="Abonnements actifs" value={fmt(s.subscriptions)} />
      <StatCard label="Commerçants" value={fmt(s.merchants)} hint={`${fmt(s.aliases)} alias`} />
      <StatCard label="Règles" value={fmt(s.rules)} />
      <StatCard label="Jobs en cours" value={fmt(s.jobs_active)} />
    </div>
  );
}
