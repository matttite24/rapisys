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
  const origin = (await headers()).get("origin");

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

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
