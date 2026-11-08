import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { PageLoading } from "@/components/page-loading";
import { PageSection } from "@/components/page-section";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { ROLE_LABEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

type Params = PageProps<"/[org]/ajustes">["params"];

// Ajustes generales de la organización: datos para documentos, IVA, zona horaria e invitaciones.
export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: Params }) {
  await connection();
  const { org } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const [{ data, error }, role] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, slug, created_at, ruc, address, phone, vat_rate, invitation_days")
      .eq("id", orgId)
      .maybeSingle(),
    getMyRole(orgId),
  ]);
  if (error) {
    logDbError("ajustes", error);
    return <p role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron cargar los ajustes. Recarga la página."}</p>;
  }
  if (!data) notFound();
  const created = new Date(data.created_at).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <>
      <PageSection className="p-0">
        <OrgSettingsForm
          org={org}
          canEdit={role === "admin"}
          values={{
            name: data.name,
            ruc: data.ruc ?? "",
            address: data.address ?? "",
            phone: data.phone ?? "",
            vatRate: String(data.vat_rate),
            invitationDays: Number(data.invitation_days),
          }}
        />
      </PageSection>
      <PageSection label="Información" className="p-0">
        <dl className="grid gap-x-10 gap-y-4 p-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Dirección de la organización</dt>
            <dd className="font-mono text-sm">{data.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Creada</dt>
            <dd className="text-sm">{created}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tu rol</dt>
            <dd className="text-sm">{role ? ROLE_LABEL[role] : "—"}</dd>
          </div>
        </dl>
      </PageSection>
    </>
  );
}
