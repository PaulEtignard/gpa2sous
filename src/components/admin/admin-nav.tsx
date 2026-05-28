"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/merchants", label: "Commerçants" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/jobs", label: "Jobs" },
];

export function AdminNav() {
  const pathname = usePathname();
  const active = TABS.filter((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex gap-1 border-b border-white/[0.06]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "relative px-3 py-2 text-sm font-medium transition-colors",
            t.href === active
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.href === active && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </Link>
      ))}
    </div>
  );
}
