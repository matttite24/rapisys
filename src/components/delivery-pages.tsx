import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection, TABLE_TD as TD, TABLE_TH as TH } from "@/components/page-section";
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
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const supabase = await createClient();

  const [delRes, listRes] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id, list_id, number, delivered_on, received_by, notes")
      .eq("contract_id", id)
      .order("number", { ascending: false })
      .limit(500),
    supabase.from("contract_lists").select("id, name").eq("contract_id", id),
  ]);
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

  return (
    <PageSection label={`${deliveries.length} ${deliveries.length === 1 ? "entrega" : "entregas"}`} className="p-0">
      {deliveries.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-xl text-muted-foreground">
            Aún no hay entregas. Se generan desde Abastecimiento, con las líneas que ya tienen stock.
          </p>
          <Link href={`/${org}/contratos/${id}/abastecimiento`} className={buttonVariants({ variant: "outline" })}>
            Ir a Abastecimiento
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Entrega</th>
                <th scope="col" className={TH}>Fecha</th>
                <th scope="col" className={TH}>Lista</th>
                <th scope="col" className={`${TH} text-right`}>Líneas</th>
                <th scope="col" className={`${TH} text-right`}>Unidades</th>
                <th scope="col" className={TH}>Recibe</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/contratos/${id}/entregas/${d.id}`}
                      className="block px-4 py-3 font-mono font-medium underline-offset-4 hover:underline"
                    >
                      {code(d.number)}
                    </Link>
                  </td>
                  <td className={`${TD} num whitespace-nowrap`}>{formatIso(d.delivered_on)}</td>
                  <td className={TD}>{listName.get(d.list_id) ?? "—"}</td>
                  <td className={`${TD} num text-right`}>{totals.get(d.id)?.lines ?? 0}</td>
                  <td className={`${TD} num text-right`}>{totals.get(d.id)?.units ?? 0}</td>
                  <td className={TD}>{d.received_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}

export function DeliveryListPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
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
          .select("id, n, part_number, description, unit, cpc, quantity")
          .in("id", dl.map((l) => l.contract_item_id))
      : { data: [] },
    list?.asset_id
      ? supabase.from("assets").select("kind, brand, model, serial, engine, identifier").eq("id", list.asset_id).maybeSingle()
      : { data: null },
  ]);
  const qtyByItem = new Map(dl.map((l) => [l.contract_item_id, Number(l.quantity)]));
  const items = ((itemsRes.data ?? []) as {
    id: string;
    n: number;
    part_number: string | null;
    description: string;
    unit: string;
    cpc: string | null;
    quantity: number;
  }[]).sort((a, b) => a.n - b.n);
  const asset = assetRes.data as {
    kind: string;
    brand: string | null;
    model: string | null;
    serial: string | null;
    engine: string | null;
    identifier: string | null;
  } | null;
  const totalUnits = items.reduce((s, i) => s + (qtyByItem.get(i.id) ?? 0), 0);

  const info: [string, string | null | undefined][] = asset
    ? [
        ["Tipo", ASSET_KIND_LABEL[asset.kind as AssetKind]],
        ["Marca", asset.brand],
        ["Modelo", asset.model],
        ["Serie", asset.serial],
        ["Motor", asset.engine],
        ["Identificador", asset.identifier],
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
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">{orgRes.data?.name}</p>
            <h1 className="pt-1 text-2xl font-semibold tracking-tight">Reporte de entrega</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold">{code(d.number)}</p>
            <p className="num text-muted-foreground">{formatIso(d.delivered_on)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-b py-4">
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Cliente</dt>
            <dd>{clientRes.data?.name}</dd>
            {clientRes.data?.ruc && <dd className="font-mono text-xs text-muted-foreground">{clientRes.data.ruc}</dd>}
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Contrato</dt>
            <dd>{c.name}</dd>
            <dd className="font-mono text-xs text-muted-foreground">{c.code}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Responsable</dt>
            <dd>{managerRes.data?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Lista</dt>
            <dd>{list?.name ?? "—"}</dd>
          </div>
        </dl>

        {info.some(([, v]) => v) && (
          <dl className="grid grid-cols-3 gap-x-8 gap-y-3 border-b py-4">
            {info
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
          </dl>
        )}

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-foreground text-left font-mono text-[0.6875rem] uppercase tracking-[0.1em]">
              <th className="px-2 py-2 text-right">N.º</th>
              <th className="px-2 py-2">Part. num.</th>
              <th className="px-2 py-2">Descripción</th>
              <th className="px-2 py-2 text-right">Cantidad</th>
              <th className="px-2 py-2">Unidad</th>
              <th className="px-2 py-2">CPC</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b break-inside-avoid">
                <td className="num px-2 py-2 text-right">{i.n}</td>
                <td className="px-2 py-2 font-mono text-xs">{i.part_number ?? "—"}</td>
                <td className="px-2 py-2">{i.description}</td>
                <td className="num px-2 py-2 text-right">
                  {qtyByItem.get(i.id)}
                  {Number(i.quantity) !== qtyByItem.get(i.id) && (
                    <span className="text-muted-foreground"> de {Number(i.quantity)}</span>
                  )}
                </td>
                <td className="px-2 py-2">{unitLabel(i.unit)}</td>
                <td className="px-2 py-2 font-mono text-xs">{i.cpc ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td colSpan={3} className="px-2 py-2 font-mono text-xs uppercase tracking-[0.1em]">
                {items.length} {items.length === 1 ? "línea" : "líneas"}
              </td>
              <td className="num px-2 py-2 text-right font-semibold">{totalUnits}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        {d.notes && (
          <p className="mt-6 text-sm">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Notas · </span>
            {d.notes}
          </p>
        )}

        <div className="mt-20 grid grid-cols-2 gap-16 break-inside-avoid">
          <div className="border-t border-foreground pt-2">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Entrega</p>
            <p>{orgRes.data?.name}</p>
          </div>
          <div className="border-t border-foreground pt-2">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Recibe</p>
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
