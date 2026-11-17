import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AssetForm, type AssetData } from "@/components/asset-form";
import { PageSection } from "@/components/page-section";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type IdParams = Promise<{ org: string; id: string }>;


async function NewForm({ params }: { params: Params }) {
  await connection();
  const { org } = await params;
  return <AssetForm org={org} />;
}

export function AssetNewPage({ params }: { params: Params }) {
  return (
    <>
      <PageSection>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo activo</h1>
      </PageSection>
      <Suspense>
        <NewForm params={params} />
      </Suspense>
    </>
  );
}

async function EditForm({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("assets")
    .select("id, kind, name, brand, model, year, plate, serial, engine, identifier, other")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) notFound();

  const role = await getMyRole(orgId);
  return <AssetForm org={org} asset={data as AssetData} canDelete={role === "admin"} />;
}

export function AssetEditPage({ params }: { params: IdParams }) {
  return (
    <>
      <PageSection>
        <h1 className="text-2xl font-semibold tracking-tight">Editar activo</h1>
      </PageSection>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}
