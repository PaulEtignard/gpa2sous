import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  PieChart,
  ShieldCheck,
  Tags,
  Wallet,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-primary" />
            Gpadesous
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Connexion
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Commencer</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Reprends le contrôle de ton budget,
          <span className="text-primary"> sans saisir une ligne</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Importe tes relevés bancaires au format CSV — toutes banques. Gpadesous catégorise
          automatiquement et te donne des dashboards lisibles pour comprendre où part ton argent.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Créer un compte gratuit <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              J'ai déjà un compte
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
          <Feature
            icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
            title="Import universel"
            description="Le parser détecte automatiquement le format de ta banque : encodage, séparateur, dates, montants. Aucune config."
          />
          <Feature
            icon={<Tags className="h-5 w-5 text-primary" />}
            title="Catégorisation auto"
            description="150+ marchands reconnus dès le départ (Carrefour, SNCF, Netflix…). Tu peux affiner avec tes propres règles."
          />
          <Feature
            icon={<PieChart className="h-5 w-5 text-primary" />}
            title="Dashboards clairs"
            description="Revenus, dépenses, évolution mensuelle, répartition par catégorie, budgets vs réel — tout d'un coup d'œil."
          />
          <Feature
            icon={<BarChart3 className="h-5 w-5 text-primary" />}
            title="Multi-comptes"
            description="Compte courant, livret, carte… Importe chaque compte séparément et compare-les."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title="Tes données t'appartiennent"
            description="Stockage sécurisé Supabase avec Row Level Security. Toi seul·e accède à tes transactions."
          />
          <Feature
            icon={<Wallet className="h-5 w-5 text-primary" />}
            title="Budgets mensuels"
            description="Fixe un objectif par catégorie. Gpadesous t'alerte quand tu approches de la limite."
          />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Gpadesous</span>
          <span>Fait avec Next.js + Supabase</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </div>
        <h3 className="mb-1 font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
