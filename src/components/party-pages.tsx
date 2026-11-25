import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PartyForm } from "@/components/party-form";
import { PARTIES, isClientType, type Party, type PartyKind } from "@/lib/parties";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type IdParams = Promise<{ org: string; id: string }>;


async function NewForm({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams?: Search }) {
  await connection();
  const { org } = await params;
  const search = searchParams ? await searchParams : {};
  const type = typeof search.tipo === "string" && isClientType(search.tipo) ? search.tipo : undefined;
  return <PartyForm kind={kind} org={org} defaultClientType={type} />;
}

export function PartyNewPage({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams?: Search }) {
  return (
    <>
      {/* El título lo pone el encabezado de la sección; aquí solo queda para lectores de pantalla. */}
      <h1 className="sr-only">{PARTIES[kind].newLabel}</h1>
      <Suspense>
        <NewForm kind={kind} params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EditForm({ kind, params }: { kind: PartyKind; params: IdParams }) {
  await connection();
  const cfg = PARTIES[kind];
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(cfg.table)
    .select(kind === "clients" ? "id, name, ruc, address, client_type" : "id, name, ruc, address")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) { logDbError("directorio: editar", error); return <p role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo cargar el registro."}</p>; }
  if (!data) notFound();

  const role = await getMyRole(orgId);
  return <PartyForm kind={kind} org={org} party={data as unknown as Party} canDelete={role === "admin"} />;
}

export function PartyEditPage({ kind, params }: { kind: PartyKind; params: IdParams }) {
  return (
    <>
      <h1 className="sr-only">Editar {PARTIES[kind].singular}</h1>
      <Suspense>
        <EditForm kind={kind} params={params} />
      </Suspense>
    </>
  );
}
