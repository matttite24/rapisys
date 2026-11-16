"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function OrgForm() {
  const [state, action, pending] = useActionState(createOrganization, undefined);

  return (
    <Card className="w-full max-w-sm border bg-card shadow-none ring-0">
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-xl normal-case tracking-normal">Crea tu organización</CardTitle>
        <CardDescription>
          Todos los procesos, items y usuarios viven dentro de una organización.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" name="name" required autoFocus />
            </Field>
            {state?.error && <FieldError>{state.error}</FieldError>}
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear organización"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
