"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/invitacion/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitation.bind(null, token),
    undefined,
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Invitación a una organización</CardTitle>
        <CardDescription>Acepta para unirte con la cuenta con la que iniciaste sesión.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {state?.error && <FieldError>{state.error}</FieldError>}
          <Button type="submit" disabled={pending}>
            {pending ? "Uniéndote…" : "Aceptar invitación"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
