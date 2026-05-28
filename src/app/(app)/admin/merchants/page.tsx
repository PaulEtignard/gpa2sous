import { requireAdmin } from "@/lib/admin";
import { MerchantsManager, type MerchantWithAliases } from "@/components/admin/merchants-manager";

export default async function AdminMerchantsPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("merchants")
    .select("id, display_name, domain, logo_url, source, merchant_aliases(id, pattern)")
    .order("display_name");

  const merchants = (data ?? []) as MerchantWithAliases[];

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Base de connaissances partagée. La détection d&apos;abonnements cherche d&apos;abord ici (par
        alias) avant d&apos;interroger l&apos;IA — chaque commerçant découvert par l&apos;IA y est
        ajouté automatiquement.
      </p>
      <MerchantsManager merchants={merchants} />
    </div>
  );
}
