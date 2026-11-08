"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  mode: "login" | "signup";
  next?: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isLogin = mode === "login";

  return (
    <div className="crosshair-start w-full max-w-sm border bg-card shadow-raised">
      <h1 className="flex h-12 items-center border-b px-6 caps-md font-bold">{isLogin ? "Iniciar sesión" : "Crear cuenta"}</h1>
      <form action={formAction} className="flex flex-col gap-6 p-6">
        <p className="text-sm text-muted-foreground">{isLogin ? "Entra a Rapisys con tu correo." : "Regístrate en Rapisys."}</p>
        {next && <input type="hidden" name="next" value={next} />}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />
          </Field>
          {state?.error && <FieldError>{state.error}</FieldError>}
          {state?.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        </FieldGroup>
        <Button type="submit" variant="brand" size="lg" disabled={pending} className="w-full">
          {pending ? "Procesando…" : isLogin ? "Entrar" : "Registrarme"}
        </Button>
      </form>
      <p className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
        {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link
          href={`${isLogin ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {isLogin ? "Regístrate" : "Inicia sesión"}
        </Link>
      </p>
    </div>
  );
}
