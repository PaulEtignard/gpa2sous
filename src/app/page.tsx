import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  FileUp,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Fake data for the in-page app mockup ──────────────────────────────────────
const MOCK_CATS = [
  { name: "Alimentation", color: "#22c55e", pct: 72, amount: "487 €" },
  { name: "Transport",    color: "#3b82f6", pct: 48, amount: "312 €" },
  { name: "Loisirs",      color: "#a855f7", pct: 32, amount: "214 €" },
  { name: "Santé",        color: "#f59e0b", pct: 19, amount: "128 €" },
];

const MOCK_TX = [
  { desc: "NETFLIX.COM",      cat: "Loisirs",      color: "#a855f7" },
  { desc: "CARREFOUR CITY",   cat: "Alimentation", color: "#22c55e" },
  { desc: "SNCF INTERNET",    cat: "Transport",    color: "#3b82f6" },
  { desc: "SPOTIFY AB",       cat: "Loisirs",      color: "#a855f7" },
  { desc: "DR CABINET MED.",  cat: "Santé",        color: "#f59e0b" },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "hsl(222 28% 5%)" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 w-full"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", background: "hsla(222,28%,5%,0.85)" }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)", boxShadow: "0 0 10px rgba(59,130,246,0.4)" }}
            >
              G
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-zinc-100">Gpadesous</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100">
                Connexion
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="gap-1.5">
                Commencer <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Ambient glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 70%)" }}
          />

          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-24 text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              <Brain className="h-3 w-3 text-primary/70" />
              Finance personnelle · IA intégrée
            </span>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl" style={{ lineHeight: 1.1 }}>
              Comprends où part
              <br />
              <span className="text-primary">ton argent.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-zinc-500">
              Importe ton relevé bancaire. L'IA catégorise chaque transaction.
              Tu obtiens des dashboards nets — budgets, abonnements, tendances.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="gap-2 px-6">
                  Créer un compte gratuit <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="px-6 text-zinc-400 border-white/[0.08] hover:text-zinc-100">
                  J'ai déjà un compte
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── App mockup ──────────────────────────────────────────────────── */}
        <section className="relative mx-auto w-full max-w-2xl px-6 pb-24">
          {/* Bottom fade so mockup bleeds into the next section */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-32"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(222 28% 5%))" }}
          />

          <div
            className="rounded-2xl p-6"
            style={{
              background: "linear-gradient(145deg, hsl(224 28% 10%) 0%, hsl(222 28% 7%) 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 32px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.2)",
            }}
          >
            {/* Mock header */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Tableau de bord</p>
                <p className="mt-0.5 text-sm font-medium text-zinc-300">Mai 2025</p>
              </div>
              <div className="flex gap-1">
                {["", "", ""].map((_, i) => (
                  <div key={i} className="h-2 w-2 rounded-full bg-white/[0.07]" />
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              {[
                { label: "Revenus",  value: "+3 250 €", color: "text-primary" },
                { label: "Dépenses", value: "−1 847 €", color: "text-red-400" },
                { label: "Net",      value: "+1 403 €", color: "text-zinc-200" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{kpi.label}</p>
                  <p className={`mt-1 text-base font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Category bars */}
            <div className="space-y-2.5">
              {MOCK_CATS.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
                  <span className="w-28 truncate text-xs text-zinc-500">{cat.name}</span>
                  <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, background: "rgba(255,255,255,0.04)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${cat.pct}%`, background: cat.color, opacity: 0.55 }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs tabular-nums text-zinc-600">{cat.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3 Features ──────────────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<FileUp className="h-4 w-4" />}
              title="Import universel"
              desc="CSV ou PDF — toutes banques, tous formats. Le parseur détecte la structure automatiquement."
            />
            <FeatureCard
              icon={<Brain className="h-4 w-4" />}
              title="Catégorisation IA"
              desc="L'IA reconnaît Netflix, SNCF, Carrefour et tes abonnements récurrents sans configuration."
              highlight
            />
            <FeatureCard
              icon={<BarChart3 className="h-4 w-4" />}
              title="Vue d'ensemble"
              desc="Dashboards, budgets mensuels, abonnements détectés, tendances sur 12 mois."
            />
          </div>
        </section>

        {/* ── AI demo ─────────────────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Text */}
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary/70">
                <Brain className="h-3 w-3" /> Intelligence artificielle
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
                Zéro saisie manuelle.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                L'IA lit les libellés bruts de ta banque et les associe à tes catégories.
                Tes règles personnalisées sont appliquées en priorité — l'IA prend le relais
                pour tout le reste.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  "Reconnaissance de +150 marchands courants",
                  "Détection automatique des abonnements",
                  "Apprentissage de tes règles personnelles",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-500">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Transaction → category mockup */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(145deg, hsl(224 28% 10%) 0%, hsl(222 28% 7%) 100%)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
            >
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Libellés bancaires → catégories
              </p>
              <div className="space-y-1">
                {MOCK_TX.map((tx) => (
                  <div
                    key={tx.desc}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}
                  >
                    <span className="font-mono text-xs text-zinc-500">{tx.desc}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: tx.color }} />
                      <span className="text-xs font-medium text-zinc-400">{tx.cat}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/[0.05] px-3 py-2">
                <Brain className="h-3.5 w-3.5 text-primary/60" />
                <span className="text-xs text-primary/60">5 transactions catégorisées par l'IA</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Privacy note ────────────────────────────────────────────────── */}
        <div className="mx-auto mb-24 flex items-center gap-2 text-xs text-zinc-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Données chiffrées · Row Level Security · Toi seul accèdes à tes transactions
        </div>

        {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
        <section
          className="mx-auto mb-24 w-full max-w-2xl rounded-2xl px-8 py-12 text-center"
          style={{
            background: "linear-gradient(145deg, hsl(224 28% 10%) 0%, hsl(222 28% 7%) 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset",
          }}
        >
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            Prêt à y voir clair ?
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Gratuit. Aucune carte bancaire requise.
          </p>
          <Link href="/signup" className="mt-6 inline-block">
            <Button size="lg" className="gap-2 px-8">
              Commencer maintenant <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-zinc-700">
          <span>© {new Date().getFullYear()} Gpadesous</span>
          <span>Next.js · Supabase · OpenRouter</span>
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
  highlight = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: highlight
          ? "linear-gradient(145deg, hsl(222 60% 12%) 0%, hsl(222 40% 9%) 100%)"
          : "linear-gradient(145deg, hsl(224 28% 10%) 0%, hsl(222 28% 7%) 100%)",
        border: highlight
          ? "1px solid rgba(59,130,246,0.18)"
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: highlight ? "0 0 24px rgba(59,130,246,0.06)" : undefined,
      }}
    >
      <div
        className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg"
        style={{
          background: highlight ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
          color: highlight ? "hsl(217 91% 65%)" : "#71717a",
          border: highlight ? "1px solid rgba(59,130,246,0.2)" : "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {icon}
      </div>
      <h3 className="mb-1.5 text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-600">{desc}</p>
    </div>
  );
}
