import { DeliveryList } from "@/components/delivery-list";
import { PageLoading } from "@/components/page-loading";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/page-section";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { unitLabel } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type DeliveryParams = Promise<{ org: string; id: string; deliveryId: string }>;

const code = (n: number) => `ENT-${String(n).padStart(3, "0")}`;

type DeliveryRow = {
  id: string;
  list_id: string;
  number: number;
  delivered_on: string;
  received_by: string | null;
  notes: string | null;
};

// Lista de entregas del contrato.
async function List({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);

  const [found, delRes, listRes] = await Promise.all([
    getContract(org, id),
    supabase
      .from("deliveries")
      .select("id, list_id, number, delivered_on, received_by, notes")
      .eq("contract_id", id)
      .order("number", { ascending: false })
      .limit(500),
    supabase.from("contract_lists").select("id, name").eq("contract_id", id),
  ]);
  if (!found) notFound();
  const deliveries = (delRes.data ?? []) as DeliveryRow[];
  const listName = new Map(((listRes.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));

  const { data: lineRows } = deliveries.length
    ? await supabase.from("delivery_lines").select("delivery_id, quantity").in("delivery_id", deliveries.map((d) => d.id))
    : { data: [] };
  const totals = new Map<string, { lines: number; units: number }>();
  for (const l of (lineRows ?? []) as { delivery_id: string; quantity: number }[]) {
    const t = totals.get(l.delivery_id) ?? { lines: 0, units: 0 };
    t.lines += 1;
    t.units += Number(l.quantity);
    totals.set(l.delivery_id, t);
  }

  return <DeliveryList org={org} contractId={id} rows={deliveries.map((delivery) => ({
    id: delivery.id, number: delivery.number, delivered_on: delivery.delivered_on, received_by: delivery.received_by,
    listName: listName.get(delivery.list_id) ?? "—",
    lines: totals.get(delivery.id)?.lines ?? 0, units: totals.get(delivery.id)?.units ?? 0,
  }))} />;
}

export function DeliveryListPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <List params={params} />
    </Suspense>
  );
}

// Reporte de entrega, listo para imprimir o guardar como PDF.
async function Report({ params }: { params: DeliveryParams }) {
  await connection();
  const { org, id, deliveryId } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { c } = found;
  const supabase = await createClient();

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, list_id, number, delivered_on, received_by, notes")
    .eq("id", deliveryId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!delivery) notFound();
  const d = delivery as DeliveryRow;

  const [linesRes, listRes, clientRes, managerRes, orgRes] = await Promise.all([
    supabase.from("delivery_lines").select("contract_item_id, quantity").eq("delivery_id", deliveryId),
    supabase.from("contract_lists").select("id, name, asset_id").eq("id", d.list_id).maybeSingle(),
    supabase.from("clients").select("name, ruc, address").eq("id", c.client_id).maybeSingle(),
    supabase.from("contract_managers").select("name").eq("id", c.manager_id).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", c.organization_id).maybeSingle(),
  ]);
  const dl = (linesRes.data ?? []) as { contract_item_id: string; quantity: number }[];
  const list = listRes.data as { id: string; name: string; asset_id: string | null } | null;

  const [itemsRes, assetRes] = await Promise.all([
    dl.length
      ? supabase
          .from("contract_item_supply")
          .select("id, n, part_number, description, unit, quantity")
          .in("id", dl.map((l) => l.contract_item_id))
      : { data: [] },
    list?.asset_id
      ? supabase.from("assets").select("kind, brand, model, serial, engine, identifier, year, other").eq("id", list.asset_id).maybeSingle()
      : { data: null },
  ]);
  const qtyByItem = new Map(dl.map((l) => [l.contract_item_id, Number(l.quantity)]));
  const items = ((itemsRes.data ?? []) as {
    id: string;
    n: number;
    part_number: string | null;
    description: string;
    unit: string;
    quantity: number;
  }[]).sort((a, b) => a.n - b.n);
  const asset = assetRes.data as {
    kind: string;
    brand: string | null;
    model: string | null;
    serial: string | null;
    engine: string | null;
    identifier: string | null;
    year: number | null;
    other: string | null;
  } | null;
  const totalUnits = items.reduce((s, i) => s + (qtyByItem.get(i.id) ?? 0), 0);

  const info: [string, string | null | undefined][] = asset
    ? [
        ["Tipo", ASSET_KIND_LABEL[asset.kind as AssetKind]],
        ["Marca", asset.brand],
        ["Modelo", asset.model],
        ["Serie", asset.serial],
        ["Serie del motor", asset.engine],
        ["Año de fabricación", asset.year === null ? null : String(asset.year)],
        ["N.º de identificación", asset.identifier],
        ["Otro", asset.other],
      ]
    : [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 print:hidden">
        <Link href={`/${org}/contratos/${id}/entregas`} className={buttonVariants({ variant: "outline" })}>
          ← Entregas
        </Link>
        <PrintButton />
      </div>

      {/* El documento: en pantalla va sobre el fondo; al imprimir ocupa la hoja. */}
      <article className="mx-auto max-w-[210mm] bg-background px-6 py-8 text-sm print:max-w-none print:p-0 print:text-[11pt]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-4">
          <div>
            <p className="caps-md text-muted-foreground">{orgRes.data?.name}</p>
            <h1 className="pt-1 text-2xl font-semibold tracking-tight">Reporte de entrega</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold">{code(d.number)}</p>
            <p className="num text-muted-foreground">{formatIso(d.delivered_on)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-b py-4">
          <div>
            <dt className="caps text-muted-foreground">Cliente</dt>
            <dd>{clientRes.data?.name}</dd>
            {clientRes.data?.ruc && <dd className="font-mono text-xs text-muted-foreground">{clientRes.data.ruc}</dd>}
          </div>
          <div>
            <dt className="caps text-muted-foreground">Contrato</dt>
            <dd>{c.name}</dd>
            <dd className="font-mono text-xs text-muted-foreground">{c.code}</dd>
          </div>
          <div>
            <dt className="caps text-muted-foreground">Responsable</dt>
            <dd>{managerRes.data?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="caps text-muted-foreground">Lista</dt>
            <dd>{list?.name ?? "—"}</dd>
          </div>
        </dl>

        {info.some(([, v]) => v) && (
          <dl className="grid grid-cols-3 gap-x-8 gap-y-3 border-b py-4">
            {info
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="caps text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
          </dl>
        )}

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-foreground text-left caps">
              <th className="px-2 py-2 text-right">N.º</th>
              <th className="px-2 py-2">Part. num.</th>
              <th className="px-2 py-2">Descripción</th>
              <th className="px-2 py-2 text-right">Cantidad</th>
              <th className="px-2 py-2">Unidad</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b break-inside-avoid">
                <td className="num px-2 py-2 text-right">{i.n}</td>
                <td className="px-2 py-2 font-mono text-xs">{i.part_number ?? "—"}</td>
                <td className="px-2 py-2">{i.description}</td>
                <td className="num px-2 py-2 text-right">{qtyByItem.get(i.id)}</td>
                <td className="px-2 py-2">{unitLabel(i.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td colSpan={3} className="px-2 py-2 caps-md">
                {items.length} {items.length === 1 ? "línea" : "líneas"}
              </td>
              <td className="num px-2 py-2 text-right font-semibold">{totalUnits}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {d.notes && (
          <p className="mt-6 text-sm">
            <span className="caps text-muted-foreground">Notas · </span>
            {d.notes}
          </p>
        )}

        <div className="mt-20 grid grid-cols-2 gap-16 break-inside-avoid">
          <div className="border-t border-foreground pt-2">
            <p className="caps text-muted-foreground">Entrega</p>
            <p>{orgRes.data?.name}</p>
          </div>
          <div className="border-t border-foreground pt-2">
            <p className="caps text-muted-foreground">Recibe</p>
            <p>{d.received_by ?? " "}</p>
          </div>
        </div>
      </article>
    </>
  );
}

export function DeliveryReportPage({ params }: { params: DeliveryParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando reporte…" />}>
      <Report params={params} />
    </Suspense>
  );
}
