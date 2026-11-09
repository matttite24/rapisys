"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginWithGoogle, type AuthState } from "@/app/(auth)/actions";
import { HugeiconsIcon } from "@hugeicons/react";
import { PowerServiceIcon } from "@hugeicons/core-free-icons";

type Props = {
  mode: "login" | "signup";
  next?: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

const LINE = "pointer-events-none absolute bg-foreground/20";

// Marca de Google (los cuatro colores oficiales de la "G").
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3a7.2 7.2 0 0 1-10.7-3.78H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.37 14.32a7.2 7.2 0 0 1 0-4.64v-3.1H1.4a12 12 0 0 0 0 10.84l3.97-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.4 6.58l3.97 3.1A7.2 7.2 0 0 1 12 4.75Z" />
    </svg>
  );
}

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [googleState, googleAction, googlePending] = useActionState(loginWithGoogle, undefined);
  const isLogin = mode === "login";

  return (
    <div className="relative w-full max-w-sm bg-background">
      {/* Los cuatro bordes se prolongan hasta el borde de la pantalla: el formulario es la celda donde se cruzan. */}
      <span aria-hidden className={`${LINE} -inset-y-[100svh] left-0 w-px`} />
      <span aria-hidden className={`${LINE} -inset-y-[100svh] right-0 w-px`} />
      <span aria-hidden className={`${LINE} -inset-x-[100vw] top-0 h-px`} />
      <span aria-hidden className={`${LINE} -inset-x-[100vw] bottom-0 h-px`} />

      {/* Un nodo en cada esquina, donde se cruzan las líneas. */}
      <span aria-hidden className="absolute -top-[3px] -left-[3px] size-[7px] bg-foreground" />
      <span aria-hidden className="absolute -top-[3px] -right-[3px] size-[7px] bg-foreground" />
      <span aria-hidden className="absolute -bottom-[3px] -left-[3px] size-[7px] bg-foreground" />
      <span aria-hidden className="absolute -right-[3px] -bottom-[3px] size-[7px] bg-foreground" />

      <div className="relative flex flex-col gap-8 px-8 py-10">
        <div className="flex flex-col items-center gap-5">
          <span className="grid size-12 place-items-center bg-brand text-brand-foreground">
            <HugeiconsIcon icon={PowerServiceIcon} aria-hidden className="size-7" strokeWidth={2} />
          </span>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="font-mono text-sm font-medium text-muted-foreground">Rapisys</p>
            <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "Entrar" : "Crear cuenta"}</h1>
          </div>
        </div>

        <form action={googleAction} className="flex flex-col gap-2">
          {next && <input type="hidden" name="next" value={next} />}
          <Button type="submit" variant="outline" size="lg" disabled={googlePending} className="w-full gap-2">
            <GoogleMark />
            {googlePending ? "Abriendo Google…" : "Continuar con Google"}
          </Button>
          {googleState?.error && <FieldError>{googleState.error}</FieldError>}
        </form>

        <div className="flex items-center gap-3 caps text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />o con tu correo
          <span className="h-px flex-1 bg-border" />
        </div>

        <form action={formAction} className="flex flex-col gap-6">
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

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
          <Link
            href={`${isLogin ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {isLogin ? "Regístrate" : "Inicia sesión"}
          </Link>
        </p>
      </div>
    </div>
  );
}
