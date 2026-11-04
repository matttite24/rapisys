import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Usuario de la sesión. getUser() consulta al servidor de autenticación, así que
// se hace una sola vez por petición aunque varios componentes lo pidan.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Barrera de las acciones del servidor: sin sesión válida no se hace nada y se manda a iniciar sesión.
// Usa getClaims (verifica el token sin ir a Supabase en cada llamada). Los datos siguen protegidos
// por RLS; esto es una segunda barrera, no la única.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
});
