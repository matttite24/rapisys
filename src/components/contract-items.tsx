import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import type { ListView } from "@/components/contract-lists";
import { ReferenceList, type LineView } from "@/components/contract-lines";
import { PageSection } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

// Items del contrato: listas de referencia por activo (el cambio de lista va en la columna de opciones).
async function Items({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const supabase = await createClient();
  // Las tres consultas salen juntas; RLS limita las líneas y listas a la organización.
  const [found, linesRes, listsRes] = await Promise.all([
    getContract(org, id),
    supabase
      .from("contract_items")
      .select("id, list_id, part_number, description, quantity, unit, cpc")
      .eq("contract_id", id)
      .order("created_at"),
    supabase
      .from("contract_lists")
      .select("id, asset_id, name, model, serial, engine, identifier")
      .eq("contract_id", id)
      .order("created_at"),
  ]);
  if (!found) notFound();
  const { c } = found;
  // En Nuevo todavía no se cargan items: se vuelve al detalle.
  if (c.status === "new") redirect(`/${org}/contratos/${id}`);

  const lines: LineView[] = (
    (linesRes.data ?? []) as {
      id: string;
      list_id: string;
      part_number: string | null;
      description: string;
      quantity: number;
      unit: string;
      cpc: string | null;
    }[]
  ).map((l) => ({
    id: l.id,
    listId: l.list_id,
    partNumber: l.part_number ?? "",
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    cpc: l.cpc ?? "",
  }));

  const lists: ListView[] = (
    (listsRes.data ?? []) as {
      id: string;
      asset_id: string | null;
      name: string;
      model: string | null;
      serial: string | null;
      engine: string | null;
      identifier: string | null;
    }[]
  ).map((l) => ({
    id: l.id,
    assetId: l.asset_id,
    name: l.name,
    model: l.model ?? "",
    serial: l.serial ?? "",
    engine: l.engine ?? "",
    identifier: l.identifier ?? "",
  }));

  return <ReferenceList org={org} contractId={id} lists={lists} lines={lines} canAdd={c.status === "in_progress"} />;
}

export function ContractItemsPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Items params={params} />
    </Suspense>
  );
}
