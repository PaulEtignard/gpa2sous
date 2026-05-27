import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/app-shell/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
