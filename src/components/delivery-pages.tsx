import { DeliveryList } from "@/components/delivery-list";
import { PageLoading } from "@/components/page-loading";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/page-section";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { HeaderAction } from "@/components/header-action";
import { PageFigures } from "@/components/page-shortcuts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft01Icon, File01Icon } from "@hugeicons/core-free-icons";
import { VoidDelivery } from "@/components/void-delivery";
import { EditDelivery } from "@/components/edit-delivery";
import { DeliveryPhotos, type DeliveryPhoto } from "@/components/delivery-photos";
import { FILES_BUCKET } from "@/lib/files";
import { buttonVariants } from "@/components/ui/button";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { assetsForLines } from "@/lib/line-assets";
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
  voided_at: string | null;
  void_reason: string | null;
  voided_lines: { part_number: string | null; description: string; quantity: number; unit: string }[] | null;
};

// Lista de entregas del proceso.
async function List({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);

  const [found, delRes, listRes] = await Promise.all([
    getContract(org, id),
    supabase
      .from("deliveries")
      .select("id, list_id, number, delivered_on, received_by, notes, voided_at, void_reason, voided_lines")
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
    voided: delivery.voided_at !== null,
    // Una anulada ya no tiene líneas entregadas: se muestran las que llevaba.
    lines: delivery.voided_at ? (delivery.voided_lines?.length ?? 0) : (totals.get(delivery.id)?.lines ?? 0),
    units: delivery.voided_at ? (delivery.voided_lines ?? []).reduce((s, l) => s + Number(l.quantity), 0) : (totals.get(delivery.id)?.units ?? 0),
  }))} />;
}

export function DeliveryListPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <List params={params} />
    </Suspense>
  );
}

// Todo lo de una entrega que muestran la vista y el documento.
async function loadDelivery(params: DeliveryParams) {
  await connection();
  const { org, id, deliveryId } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { c } = found;
  const supabase = await createClient();

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, list_id, number, delivered_on, received_by, notes, voided_at, void_reason, voided_lines")
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
    // Las líneas de la lista directo de su tabla (máx. 1.000): la vista de abastecimiento calcula estados de todo el
    // proceso antes de filtrar, y era lo que hacía lenta esta pantalla. El n.º es la posición en la lista.
    dl.length
      ? supabase
          .from("contract_items")
          .select("id, part_number, description, unit, quantity")
          .eq("contract_id", id)
          .eq("list_id", d.list_id)
          .order("created_at")
          .order("id")
          .limit(1000)
      : { data: [] },
    list?.asset_id
      ? supabase.from("assets").select("name, kind, brand, model, serial, engine, identifier, year, other").eq("id", list.asset_id).maybeSingle()
      : { data: null },
  ]);
  const qtyByItem = new Map(dl.map((l) => [l.contract_item_id, Number(l.quantity)]));
  const delivered = new Set(dl.map((l) => l.contract_item_id));
  const liveItems = ((itemsRes.data ?? []) as {
    id: string;
    part_number: string | null;
    description: string;
    unit: string;
    quantity: number;
  }[])
    .map((it, i) => ({ ...it, n: i + 1 }))
    .filter((it) => delivered.has(it.id));
  // Una entrega anulada muestra lo que llevaba (copia guardada al anular).
  const voided = d.voided_at !== null;
  const items = voided
    ? (d.voided_lines ?? []).map((l, i) => ({ id: `v${i}`, n: i + 1, part_number: l.part_number, description: l.description, unit: l.unit, quantity: Number(l.quantity) }))
    : liveItems;
  if (voided) for (const i of items) qtyByItem.set(i.id, i.quantity);
  const asset = assetRes.data as {
    name?: string;
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

  // Activo de la entrega: el de la lista; si la lista no tiene, los activos relacionados con los productos de sus líneas.
  let assetNames: string[] = [];
  if (asset?.name) {
    const detail = [asset.brand, asset.model].filter(Boolean).join(" ");
    assetNames = [detail && !asset.name.toLowerCase().includes(detail.toLowerCase()) ? `${asset.name} (${detail})` : asset.name];
  } else if (!voided && dl.length) {
    const byLine = await assetsForLines(supabase, dl.map((l) => l.contract_item_id));
    assetNames = [...new Set([...byLine.values()].flat())];
  }

  return { org, id, deliveryId, found, c, d, list, voided, items, qtyByItem, totalUnits, info, assetNames, clientRes, managerRes, orgRes };
}

// Documento de la entrega, listo para imprimir o guardar como PDF.
async function Report({ params }: { params: DeliveryParams }) {
  const { org, id, deliveryId, d, voided, items, qtyByItem, totalUnits, info, assetNames, clientRes, managerRes, orgRes } = await loadDelivery(params);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 print:hidden">
        <Link href={`/${org}/contratos/${id}/entregas/${deliveryId}`} className={buttonVariants({ variant: "outline" })}>
          ← Entrega {code(d.number)}
        </Link>
        <PrintButton />
      </div>
      {voided && (
        <div role="status" className="border-b border-destructive/30 bg-destructive/5 px-6 py-3 text-sm text-destructive print:border-2 print:border-foreground print:bg-transparent print:text-foreground">
          <strong>Entrega anulada</strong> el {formatIso(String(d.voided_at).slice(0, 10))}
          {d.void_reason ? <> · {d.void_reason}</> : null}. Sus líneas volvieron a la bodega.
        </div>
      )}

      {/* El documento: en pantalla va sobre el fondo; al imprimir ocupa la hoja. */}
      <article className="mx-auto max-w-[210mm] bg-background px-6 py-8 text-sm print:max-w-none print:p-0 print:text-[11pt]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-4">
          <div>
            <p className="caps-md text-muted-foreground">{orgRes.data?.name}</p>
            <h1 className="pt-1 text-2xl font-semibold tracking-tight">Reporte de entrega{voided ? " (ANULADA)" : ""}</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold">{code(d.number)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-b py-4">
          <div>
            <dt className="caps text-muted-foreground">Cliente</dt>
            <dd>{clientRes.data?.name}</dd>
            {clientRes.data?.ruc && <dd className="font-mono text-xs text-muted-foreground">{clientRes.data.ruc}</dd>}
          </div>
          <div>
            <dt className="caps text-muted-foreground">Responsable</dt>
            <dd>{managerRes.data?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="caps text-muted-foreground">Fecha de entrega</dt>
            <dd className="num">{formatIso(d.delivered_on)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="caps text-muted-foreground">Activo</dt>
            <dd>{assetNames.length > 0 ? assetNames.join("; ") : "—"}</dd>
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
              <th className="px-2 py-2">Descripción</th>
              <th className="px-2 py-2 text-right">Cantidad</th>
              <th className="px-2 py-2">Unidad</th>
              <th className="w-[30%] px-2 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b break-inside-avoid">
                <td className="num px-2 py-2 text-right">{i.n}</td>
                <td className="px-2 py-2">{i.description}</td>
                <td className="num px-2 py-2 text-right">{qtyByItem.get(i.id)}</td>
                <td className="px-2 py-2">{unitLabel(i.unit)}</td>
                {/* En blanco: se anota a mano por línea (faltante, daño, recibido parcial…). */}
                <td className="min-h-8 border-l px-2 py-2" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td colSpan={2} className="px-2 py-2 caps-md">
                {items.length} {items.length === 1 ? "línea" : "líneas"}
              </td>
              <td className="num px-2 py-2 text-right font-semibold">{totalUnits}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>

        {/* Observación: lo escrito al generar la entrega o, si no hay nada, renglones en blanco para anotar a mano. */}
        <div className="mt-6 break-inside-avoid">
          <p className="caps text-muted-foreground">Observación</p>
          {d.notes ? (
            <p className="whitespace-pre-wrap border-b py-2">{d.notes}</p>
          ) : (
            <div aria-hidden className="mt-1">
              <div className="h-8 border-b" />
              <div className="h-8 border-b" />
              <div className="h-8 border-b" />
            </div>
          )}
        </div>

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

// Fotos de la entrega, con miniaturas firmadas en una sola llamada.
async function loadPhotos(contractId: string, deliveryId: string): Promise<DeliveryPhoto[]> {
  // Firmar las miniaturas usa la hora: se hace al atender la petición, no al prerenderizar.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.from("contract_files").select("id, name, thumb_path, created_at")
    .eq("contract_id", contractId).eq("source", "delivery").eq("source_id", deliveryId).order("created_at");
  const rows = (data ?? []) as { id: string; name: string; thumb_path: string | null; created_at: string }[];
  const thumbPaths = rows.map((r) => r.thumb_path).filter((x): x is string => !!x);
  const signed = thumbPaths.length ? await supabase.storage.from(FILES_BUCKET).createSignedUrls(thumbPaths, 3600) : null;
  const thumbUrl = new Map((signed?.data ?? []).map((x) => [x.path, x.signedUrl]));
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, thumbUrl: (r.thumb_path && thumbUrl.get(r.thumb_path)) || undefined }));
}

// Vista de la entrega dentro de la app: datos, líneas entregadas y acciones. El documento para imprimir va aparte.
async function View({ params }: { params: DeliveryParams }) {
  // Los datos de la entrega y sus fotos se piden a la vez.
  const { id: contractParam, deliveryId: deliveryParam } = await params;
  const [loaded, photos] = await Promise.all([loadDelivery(params), loadPhotos(contractParam, deliveryParam)]);
  const { org, id, deliveryId, found, d, list, voided, items, qtyByItem, totalUnits, info } = loaded;
  const base = `/${org}/contratos/${id}`;
  const canVoid = !voided && found.c.status === "in_progress";

  return (
    <>
      <HeaderAction icon={ArrowLeft01Icon} label="Volver" href={`${base}/entregas`} secondary />
      <HeaderAction icon={File01Icon} label="Ver documento" href={`${base}/entregas/${deliveryId}/documento`} />
      <PageFigures figures={[
        { label: items.length === 1 ? "Línea" : "Líneas", value: String(items.length) },
        { label: totalUnits === 1 ? "Unidad" : "Unidades", value: String(totalUnits) },
      ]} />
      {voided && (
        <div role="status" className="border-b border-destructive/30 bg-destructive/5 px-6 py-3 text-sm text-destructive">
          <strong>Entrega anulada</strong> el {formatIso(String(d.voided_at).slice(0, 10))}
          {d.void_reason ? <> · {d.void_reason}</> : null}. Sus líneas volvieron a la bodega.
        </div>
      )}
      <PageSection label={`Fotografías (${photos.length})`} className="p-0">
        <DeliveryPhotos org={org} contractId={id} deliveryId={deliveryId} photos={photos} canEdit={!voided} />
      </PageSection>

      <PageSection label={`Entrega ${code(d.number)}`} meta={
        <span className="flex items-center gap-2">
          <Badge variant={voided ? "destructive" : "solid-stock"}>{voided ? "Anulada" : "Entregada"}</Badge>
          {canVoid && (
            <EditDelivery org={org} contractId={id} deliveryId={deliveryId} code={code(d.number)} date={d.delivered_on} receivedBy={d.received_by ?? ""} notes={d.notes ?? ""} />
          )}
        </span>
      } className="p-0">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 px-4 py-4 lg:grid-cols-4">
          <Field label="Fecha" value={<span className="num">{formatIso(d.delivered_on)}</span>} />
          <Field label="Lista" value={list?.name ?? "—"} />
          <Field label="Recibe" value={d.received_by ?? "—"} />
          <Field label="Contrato" value={found.c.name} />
          {d.notes && <div className="col-span-2 lg:col-span-4"><Field label="Notas" value={<span className="whitespace-pre-wrap">{d.notes}</span>} /></div>}
        </dl>
        {info.some(([, v]) => v) && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
            {info.filter(([, v]) => v).map(([k, v]) => (
              <Field key={k} label={k} value={<span className="font-mono">{v}</span>} />
            ))}
          </dl>
        )}
      </PageSection>

      <PageSection label="Líneas entregadas" className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Esta entrega no tiene líneas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-transparent">
                  <TableHead className="text-right">N.º</TableHead>
                  <TableHead>N.º de parte</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} className="border-b last:border-b-0">
                    <TableCell className="num text-right text-muted-foreground">{i.n}</TableCell>
                    <TableCell className="font-mono text-xs">{i.part_number ?? "—"}</TableCell>
                    <TableCell className="min-w-56">{i.description}</TableCell>
                    <TableCell className="num text-right">{qtyByItem.get(i.id)}</TableCell>
                    <TableCell>{unitLabel(i.unit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      {canVoid && (
        <PageSection label="Anular" className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Si la entrega se registró por error, anúlala: sus líneas vuelven a la bodega y quedan otra vez listas para entregar.
            </p>
            <VoidDelivery org={org} contractId={id} deliveryId={deliveryId} code={code(d.number)} />
          </div>
        </PageSection>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="caps text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

export function DeliveryViewPage({ params }: { params: DeliveryParams }) {
  return (
    <>
      <h1 className="sr-only">Entrega</h1>
      <Suspense fallback={<PageLoading />}>
        <View params={params} />
      </Suspense>
    </>
  );
}
