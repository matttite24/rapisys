import { Suspense } from "react";
import { connection } from "next/server";
import { OrgForm } from "@/components/org-form";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// Solo quien puede crear organizaciones ve el formulario; el resto necesita una invitación.
async function Gate() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_create_organization");
  // Si la función aún no existe (migración pendiente), se mantiene el comportamiento abierto.
  const allowed = error ? true : data === true;

  if (allowed) return <OrgForm />;
  return (
    <Card className="w-full max-w-sm border bg-card shadow-none ring-0">
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-xl normal-case tracking-normal">
          Necesitas una invitación
        </CardTitle>
        <CardDescription>
          Tu cuenta no puede crear organizaciones nuevas. Para unirte a una, pide a un
          administrador el enlace de invitación y ábrelo con esta misma sesión.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={logout}>
          <Button type="submit" variant="outline">Cerrar sesión</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function OnboardingPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Suspense>
        <Gate />
      </Suspense>
    </main>
  );
}
