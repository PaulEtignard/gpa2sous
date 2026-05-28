import { requireAdmin } from "@/lib/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AdminJob {
  id: string;
  user_id: string;
  email: string | null;
  type: string;
  status: string;
  result: unknown;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400",
  running: "bg-sky-500/15 text-sky-400",
  pending: "bg-amber-500/15 text-amber-400",
  failed: "bg-red-500/15 text-red-400",
  error: "bg-red-500/15 text-red-400",
};

export default async function AdminJobsPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase.rpc("admin_list_jobs", { p_limit: 100 });
  const jobs = (data ?? []) as AdminJob[];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Utilisateur</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Créé</TableHead>
            <TableHead>Mis à jour</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                Aucun job.
              </TableCell>
            </TableRow>
          )}
          {jobs.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="font-medium">{j.email ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{j.type}</TableCell>
              <TableCell>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[j.status] ?? "bg-white/[0.06] text-muted-foreground"
                  }`}
                >
                  {j.status}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {new Date(j.created_at).toLocaleString("fr-FR")}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {new Date(j.updated_at).toLocaleString("fr-FR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
