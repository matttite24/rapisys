"use server";

import { redirect } from "next/navigation";
import type { AuthState } from "@/app/(auth)/actions";
import { slugify, withSuffix } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ingresa el nombre de la organización." };

  const supabase = await createClient();
  const base = slugify(name);

  // Si el slug ya existe (23505), reintenta con un sufijo.
  for (let i = 0; i < 3; i++) {
    const slug = i === 0 ? base : withSuffix(base);
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: name,
      p_slug: slug,
    });
    if (!error) redirect(`/${data.slug}/inicio`);
    if (error.code !== "23505") {
      // Solo se muestran los mensajes que la base escribe para personas.
      const known = ["Necesitas una invitación", "Ese nombre está reservado"];
      return {
        error: known.some((k) => error.message.includes(k))
          ? error.message
          : "No se pudo crear la organización. Inténtalo de nuevo.",
      };
    }
  }
  return { error: "No se pudo generar un identificador único. Prueba otro nombre." };
}
