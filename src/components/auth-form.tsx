"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="w-full max-w-sm border bg-card shadow-none ring-0">
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-xl normal-case tracking-normal">{isLogin ? "Iniciar sesión" : "Crear cuenta"}</CardTitle>
        <CardDescription>
          {isLogin ? "Entra a Rapisys con tu correo." : "Regístrate en Rapisys."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
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
            {state?.message && (
              <p className="text-sm text-muted-foreground">{state.message}</p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Procesando…" : isLogin ? "Entrar" : "Registrarme"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
              <Link
                href={`${isLogin ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="underline underline-offset-4"
              >
                {isLogin ? "Regístrate" : "Inicia sesión"}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
