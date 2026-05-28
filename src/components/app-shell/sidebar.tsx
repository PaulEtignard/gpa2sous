"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileUp,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { JobNotification } from "./job-notification";

const primaryNav = [
  { href: "/dashboard",    label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions",    icon: ListOrdered },
  { href: "/budgets",      label: "Budgets",         icon: BarChart3 },
];

const manageNav = [
  { href: "/accounts",    label: "Comptes",     icon: CreditCard },
  { href: "/categories",  label: "Catégories",  icon: Tags },
  { href: "/import",      label: "Importer",    icon: FileUp },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-all duration-150",
        active
          ? "bg-primary/[0.09] text-primary"
          : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300",
      )}
    >
      {active && (
        <span
          className="absolute inset-y-[5px] left-0 w-0.5 rounded-r-full bg-primary"
          style={{ boxShadow: "0 0 6px rgba(59,130,246,0.65)" }}
        />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-zinc-600 group-hover:text-zinc-400",
        )}
      />
      {label}
    </Link>
  );
}

function NavSection({ label, items, pathname }: { label: string; items: typeof primaryNav; pathname: string }) {
  return (
    <div>
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-700">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </div>
    </div>
  );
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside
      className="hidden w-[220px] shrink-0 flex-col md:flex"
      style={{
        background: "hsl(224 26% 6%)",
        borderRight: "1px solid rgba(255,255,255,0.045)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-14 shrink-0 items-center gap-3 px-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
            boxShadow: "0 0 10px rgba(59,130,246,0.45), 0 0 20px rgba(59,130,246,0.15)",
          }}
        >
          <span className="text-[12px] font-bold leading-none text-white">G</span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-none tracking-tight text-zinc-100">
            Gpadesous
          </p>
          <p className="mt-[3px] text-[10px] leading-none text-zinc-600">
            Finance personnelle
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        <NavSection label="Analyse" items={primaryNav} pathname={pathname} />
        <NavSection label="Gestion" items={manageNav} pathname={pathname} />
      </nav>

      {/* Job notification */}
      <JobNotification />

      {/* Footer */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
            {initials}
          </div>
          <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{email}</p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Se déconnecter"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
