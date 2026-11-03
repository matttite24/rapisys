import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ListView } from "@/components/contract-lists";
import { ReferenceList, type LineView } from "@/components/contract-lines";
import { PageSection } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

// Items del contrato: listas de referencia por activo (una lista por activo, en pestañas).
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
      .select("id, asset_id, name")
      .eq("contract_id", id)
      .order("created_at"),
  ]);
  if (!found) notFound();
  const { c } = found;
  // En Nuevo todavía no se cargan items.
  if (c.status === "new") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          Los items se cargan cuando el contrato pasa a <strong className="text-foreground">En ejecución</strong>.
          Mientras tanto, corrige los datos del contrato en{" "}
          <Link href={`/${org}/contratos/${id}`} className="underline underline-offset-4">Detalle</Link>.
        </p>
      </PageSection>
    );
  }

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

  // Los datos de la máquina son del activo del catálogo; las listas generales no tienen.
  const listRows = (listsRes.data ?? []) as { id: string; asset_id: string | null; name: string }[];
  const assetIds = [...new Set(listRows.map((l) => l.asset_id).filter((x): x is string => !!x))];
  const { data: assetRows } = assetIds.length
    ? await supabase
        .from("assets")
        .select("id, kind, brand, model, serial, engine, identifier")
        .in("id", assetIds)
    : { data: [] };
  const assetsById = new Map(
    ((assetRows ?? []) as {
      id: string;
      kind: string;
      brand: string | null;
      model: string | null;
      serial: string | null;
      engine: string | null;
      identifier: string | null;
    }[]).map((a) => [a.id, a]),
  );

  const lists: ListView[] = listRows.map((l) => {
    const a = l.asset_id ? assetsById.get(l.asset_id) : undefined;
    return {
      id: l.id,
      assetId: l.asset_id,
      name: l.name,
      kind: a?.kind ?? "",
      brand: a?.brand ?? "",
      model: a?.model ?? "",
      serial: a?.serial ?? "",
      engine: a?.engine ?? "",
      identifier: a?.identifier ?? "",
    };
  });

  return <ReferenceList org={org} contractId={id} lists={lists} lines={lines} canAdd={c.status === "in_progress"} />;
}

export function ContractItemsPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Items params={params} />
    </Suspense>
  );
}
