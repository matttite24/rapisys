import { cache } from "react";
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
