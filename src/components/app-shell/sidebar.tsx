"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileUp,
  LayoutDashboard,
  ListOrdered,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { JobNotification } from "./job-notification";

const items = [
  { href: "/dashboard",    label: "Tableau de bord",  icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions",     icon: ListOrdered },
  { href: "/import",       label: "Importer un CSV",  icon: FileUp },
  { href: "/accounts",     label: "Comptes",          icon: CreditCard },
  { href: "/categories",   label: "Catégories",       icon: Tags },
  { href: "/budgets",      label: "Budgets",          icon: BarChart3 },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col md:flex"
      style={{ background: "hsl(224 24% 7%)", borderRight: "1px solid hsl(224 18% 12%)" }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: "hsl(217 91% 60%)" }}
        >
          {/* G monogram */}
          <span className="text-[13px] font-bold text-white leading-none">G</span>
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Gpadesous</span>
      </div>

      {/* Section label */}
      <div className="px-5 pb-2 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Menu
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Job notification */}
      <JobNotification />

      {/* Footer */}
      <div className="border-t border-white/[0.05] p-4">
        <p className="mb-2 truncate text-[11px] text-muted-foreground">{email}</p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[12px] text-muted-foreground transition-colors hover:text-destructive"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </aside>
  );
}
