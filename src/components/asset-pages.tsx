import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AssetForm, type AssetData } from "@/components/asset-form";
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
      {/* El título lo pone el formulario en el encabezado; aquí solo queda para lectores de pantalla. */}
      <h1 className="sr-only">Nuevo activo</h1>
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
      <h1 className="sr-only">Editar activo</h1>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}
