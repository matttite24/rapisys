import { cache } from "react";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type OrgOption = { name: string; slug: string };

// RLS ya limita el resultado a las organizaciones del usuario.
// cache() evita repetir la consulta entre componentes del mismo request.
export const getMyOrgs = cache(async (): Promise<OrgOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, slug")
    .order("name");
  return data ?? [];
});

// Resuelve el id de la organización a partir del slug de la URL (RLS: solo miembros).
export const getOrgId = cache(async (slug: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
});

// Rol del usuario actual en la organización (null si no es miembro).
export const getMyRole = cache(async (orgId: string): Promise<Role | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.role as Role | undefined) ?? null;
});
