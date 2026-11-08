"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

// Mensajes en español para los errores de autenticación más comunes.
function authMessage(error: { code?: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu correo antes de entrar: revisa tu bandeja de entrada.";
    case "user_already_exists":
      return "Ese correo ya tiene una cuenta. Inicia sesión.";
    case "weak_password":
      return "La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    default:
      return "No pudimos completar la solicitud. Inténtalo de nuevo.";
  }
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: authMessage(error) };
  redirect(safeNext(formData.get("next")));
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNext(formData.get("next"));
  // El enlace del correo vuelve a la dirección propia del sitio (NEXT_PUBLIC_SITE_URL), nunca a una que mande el
  // navegador: en producción, sin esa variable, Supabase usa el "Site URL" configurado. En desarrollo sí se usa el origen.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (process.env.NODE_ENV !== "production" ? (await headers()).get("origin") : null);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    // El enlace del correo vuelve a donde iba la persona (p. ej. su invitación).
    options: origin
      ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` }
      : undefined,
  });
  if (error) return { error: authMessage(error) };
  // Con confirmación de email activa no hay sesión hasta confirmar.
  if (!data.session) {
    return { message: "Revisa tu correo para confirmar la cuenta." };
  }
  redirect(next);
}

// Entrar con Google: Supabase manda a Google y vuelve a /auth/callback, que cierra la sesión y lleva a `next`.
// Requiere activar el proveedor Google en Supabase (Authentication → Providers).
export async function loginWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNext(formData.get("next"));
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (process.env.NODE_ENV !== "production" ? (await headers()).get("origin") : null);
  if (!site) return { error: "Falta configurar NEXT_PUBLIC_SITE_URL para entrar con Google." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return { error: "No pudimos abrir Google. Inténtalo de nuevo." };
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
