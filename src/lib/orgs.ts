import { cache } from "react";
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
