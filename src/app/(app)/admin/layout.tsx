import { Shield } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground">Gestion globale de l&apos;application.</p>
        </div>
      </div>

      <AdminNav />

      {children}
    </div>
  );
}
