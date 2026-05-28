import { requireAdmin } from "@/lib/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { setUserRole } from "../actions";

interface AdminUser {
  id: string;
  email: string | null;
  role: "user" | "admin";
  created_at: string;
  accounts: number;
  transactions: number;
  subscriptions: number;
  last_activity: string | null;
}

export default async function AdminUsersPage() {
  const { supabase, user } = await requireAdmin();

  const { data } = await supabase.rpc("admin_list_users");
  const users = (data ?? []) as AdminUser[];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead className="text-right">Comptes</TableHead>
            <TableHead className="text-right">Transactions</TableHead>
            <TableHead className="text-right">Abonnements</TableHead>
            <TableHead>Dernière activité</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
              <TableCell>
                <span
                  className={
                    u.role === "admin"
                      ? "rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                      : "rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {u.role}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{u.accounts}</TableCell>
              <TableCell className="text-right tabular-nums">{u.transactions.toLocaleString("fr-FR")}</TableCell>
              <TableCell className="text-right tabular-nums">{u.subscriptions}</TableCell>
              <TableCell className="text-muted-foreground">
                {u.last_activity ? formatDate(u.last_activity) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {u.id === user.id ? (
                  <span className="text-xs text-muted-foreground">vous</span>
                ) : (
                  <form action={setUserRole}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="role" value={u.role === "admin" ? "user" : "admin"} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-md border border-white/[0.1] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/[0.05]"
                    >
                      {u.role === "admin" ? "Rétrograder" : "Promouvoir admin"}
                    </button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
