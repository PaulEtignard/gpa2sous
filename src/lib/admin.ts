import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard for admin-only server components / actions. Redirects non-admins away
 * (to /login if signed-out, /dashboard otherwise) and returns the Supabase
 * client + user when access is granted.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  return { supabase, user };
}

/** Non-redirecting check, used to conditionally show the admin nav entry. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return data?.role === "admin";
}
