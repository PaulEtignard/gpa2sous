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
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { JobNotification } from "./job-notification";

const items = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ListOrdered },
  { href: "/import", label: "Importer un CSV", icon: FileUp },
  { href: "/accounts", label: "Comptes", icon: CreditCard },
  { href: "/categories", label: "Catégories", icon: Tags },
  { href: "/budgets", label: "Budgets", icon: BarChart3 },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center gap-2 px-6 text-lg font-semibold">
        <Wallet className="h-5 w-5 text-primary" />
        Gpadesous
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <JobNotification />
      <div className="border-t border-border p-4">
        <div className="mb-2 truncate text-xs text-muted-foreground">{email}</div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </aside>
  );
}
