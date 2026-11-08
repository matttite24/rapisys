import { PageLoading } from "@/components/page-loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { purchaseState } from "@/lib/purchase-state";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageSection } from "@/components/page-section";
import { AttachFiles } from "@/components/attach-files";
import { DeletePurchase } from "@/components/purchase-actions-ui";
import { PurchaseForm, type DraftData } from "@/components/purchase-form";
import { XmlInfoList } from "@/components/xml-info";
import { ReceiveAll, ReceiveLine, ReceiveShortcuts } from "@/components/receive-controls";
import { buttonVariants } from "@/components/ui/button";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { centsToInput, formatCents, lineAmounts, vatOf } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;
type PurchaseParams = Promise<{ org: string; id: string; purchaseId: string }>;

const NEW_BTN = (org: string, id: string) => (
  <Link href={`/${org}/contratos/${id}/compras/nueva`} className={cn(buttonVariants(), "h-10")}>
    Subir factura
  </Link>
);

// Lista de facturas de compra del contrato.
async function List({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);

  const [found, pRes, totRes, supRes] = await Promise.all([
    getContract(org, id),
    supabase
      .from("purchases")
      .select("id, number, supplier_id, purchased_on, status")
      .eq("contract_id", id)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("purchase_totals")
      .select("purchase_id, lines, units, subtotal_cents, vat_cents, unassigned, received")
      .eq("contract_id", id)
      .limit(200),
    supabase.from("suppliers").select("id, name"),
  ]);
  if (!found) notFound();
  const purchases = (pRes.data ?? []) as {
    id: string;
    number: string | null;
    supplier_id: string | null;
    purchased_on: string;
    status: "draft" | "complete";
  }[];
  const totals = new Map(
    ((totRes.data ?? []) as {
      purchase_id: string;
      lines: number;
      units: number;
      subtotal_cents: number;
      vat_cents: number;
      unassigned: number;
      received: number;
    }[]).map((t) => [t.purchase_id, t]),
  );
  const supplier = new Map(((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const canAct = found.c.status === "in_progress";

  return (
    <PageSection
      label={`${purchases.length} ${purchases.length === 1 ? "factura" : "facturas"}`}
      className="p-0"
    >
      {canAct && <HeaderAction icon={Upload01Icon} label="Subir factura" href={`/${org}/contratos/${id}/compras/nueva`} />}
      {purchases.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-xl text-muted-foreground">
            Aún no hay facturas de compra en este contrato. Cada factura es de un proveedor: primero se guarda
            como borrador mientras la revisas y, al completarla, se asigna a las líneas de las listas desde Abastecimiento.
          </p>
          {canAct && NEW_BTN(org, id)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-transparent">
                <TableHead>Factura</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Recibidas</TableHead>
                <TableHead className="text-right">Sin reservar</TableHead>
                <TableHead className="text-right">Total c/IVA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => {
                const t = totals.get(p.id);
                const draft = p.status === "draft";
                return (
                  <TableRow key={p.id} className="border-b last:border-b-0 hover:bg-accent/60">
                    <TableCell className="p-0">
                      <Link
                        href={`/${org}/contratos/${id}/compras/${p.id}${draft ? "/editar" : ""}`}
                        className="block px-4 py-3 font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {p.number ?? "Sin número"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={purchaseState(p.status, t).variant}>{purchaseState(p.status, t).label}</Badge>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">{formatIso(p.purchased_on)}</TableCell>
                    <TableCell>{(p.supplier_id && supplier.get(p.supplier_id)) || "—"}</TableCell>
                    <TableCell className="num text-right">{t ? Number(t.lines) : 0}</TableCell>
                    <TableCell className="num text-right">{t ? Number(t.units) : 0}</TableCell>
                    <TableCell className={cn("num text-right", t && Number(t.received) >= Number(t.units) && Number(t.units) > 0 && "font-medium")}>
                      {t ? Number(t.received) : 0}
                    </TableCell>
                    <TableCell className={cn("num text-right", t && Number(t.unassigned) > 0 && "font-medium")}>
                      {draft ? "—" : t ? Number(t.unassigned) : 0}
                    </TableCell>
                    <TableCell className="num text-right">
                      {t ? formatCents(Number(t.subtotal_cents) + Number(t.vat_cents)) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageSection>
  );
}

export function PurchaseListPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <List params={params} />
    </Suspense>
  );
}

// Factura nueva.
async function NewForm({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  if (found.c.status !== "in_progress") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          Las compras se registran cuando el contrato está <strong className="text-foreground">En ejecución</strong>.
        </p>
      </PageSection>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name").eq("organization_id", found.orgId).order("name");
  return <PurchaseForm org={org} contractId={id} suppliers={(data ?? []) as { id: string; name: string }[]} />;
}

export function PurchaseNewPage({ params }: { params: IdParams }) {
  return (
    <>
      <h1 className="sr-only">Nueva factura de compra</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <NewForm params={params} />
      </Suspense>
    </>
  );
}

// Detalle de una factura completa: sus líneas y la recepción de cada una. Asignarla a líneas del contrato se hace
// desde Abastecimiento, no aquí.
const DETAIL_GRID = "grid grid-cols-2 items-center gap-1.5 lg:grid-cols-[1.5rem_8rem_minmax(14rem,1fr)_3.5rem_5.5rem_3rem_6rem_15rem]";

async function Detail({ params }: { params: PurchaseParams }) {
  await connection();
  const { org, id, purchaseId } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, number, supplier_id, purchased_on, notes, status, xml_info")
    .eq("id", purchaseId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!purchase) notFound();
  const p = purchase as { id: string; number: string; supplier_id: string; purchased_on: string; notes: string | null; status: string; xml_info: Record<string, unknown> | null };
  if (p.status === "draft") redirect(`/${org}/contratos/${id}/compras/${purchaseId}/editar`);

  const [linesRes, supRes, filesRes] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select("id, item_id, quantity, unit_cost_cents, line_total_cents, vat_rate, received_qty, xml_code, new_part_number")
      .eq("purchase_id", purchaseId)
      .order("position")
      .order("id"),
    supabase.from("suppliers").select("name").eq("id", p.supplier_id).maybeSingle(),
    supabase.from("contract_files").select("id", { count: "exact", head: true }).eq("contract_id", id).eq("source", "purchase").eq("source_id", purchaseId),
  ]);
  const lines = (linesRes.data ?? []) as {
    id: string;
    item_id: string;
    quantity: number;
    unit_cost_cents: number;
    line_total_cents: number | null;
    vat_rate: number;
    received_qty: number;
    xml_code: string | null;
    new_part_number: string | null;
  }[];

  const { data: itemRows } = lines.length
    ? await supabase.from("items").select("id, name, sku, part_numbers").in("id", [...new Set(lines.map((l) => l.item_id))])
    : { data: [] };
  const itemById = new Map(
    ((itemRows ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [i.id, i]),
  );

  const rows = lines.map((l) => {
    const base = lineAmounts(Number(l.quantity), Number(l.unit_cost_cents), Number(l.vat_rate));
    // Si la línea trae el subtotal exacto de la factura, ese manda.
    const a =
      l.line_total_cents === null
        ? base
        : { subtotal: Number(l.line_total_cents), vat: vatOf(Number(l.line_total_cents), Number(l.vat_rate)), total: Number(l.line_total_cents) + vatOf(Number(l.line_total_cents), Number(l.vat_rate)) };
    const item = itemById.get(l.item_id);
    // Código tal como vino en la factura; si no hay, el del producto.
    const code = l.new_part_number || l.xml_code || item?.part_numbers?.[0] || item?.sku || "";
    return { l, a, item, code };
  });
  const subtotal = rows.reduce((s, r) => s + r.a.subtotal, 0);
  const vat = rows.reduce((s, r) => s + r.a.vat, 0);
  const received = lines.some((l) => Number(l.received_qty) > 0);
  const pendingUnits = lines.reduce((s, l) => s + Number(l.quantity) - Number(l.received_qty), 0);
  const canAct = found.c.status === "in_progress";
  const xml = p.xml_info
    ? {
        fileName: String(p.xml_info.file_name ?? ""),
        accessKey: String(p.xml_info.access_key ?? ""),
        authorization: String(p.xml_info.authorization ?? ""),
        authorizedAt: String(p.xml_info.authorized_at ?? ""),
        buyerRuc: String(p.xml_info.buyer_ruc ?? ""),
        buyerName: String(p.xml_info.buyer_name ?? ""),
        subtotalCents: Number(p.xml_info.subtotal_cents ?? 0),
        totalCents: Number(p.xml_info.total_cents ?? 0),
      }
    : null;
  const hint = "caps text-muted-foreground lg:hidden";

  return (
    <>
      <ReceiveShortcuts canReceive={canAct && pendingUnits > 0} />
      <PageSection
        label={`Factura ${p.number}`}
        meta={
          <Link href={`/${org}/contratos/${id}/compras`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-3")}>
            ← Facturas
          </Link>
        }
        className="p-0"
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 px-4 py-3 lg:grid-cols-[auto_auto_minmax(0,1fr)]">
          <Info label="Fecha" value={<span className="num">{formatIso(p.purchased_on)}</span>} />
          <Info label="Proveedor" value={supRes.data?.name ?? "—"} />
          {p.notes && <Info label="Notas" value={p.notes} />}
        </div>
      </PageSection>

      <PageSection
        label={`${lines.length} ${lines.length === 1 ? "línea" : "líneas"}`}
        meta={canAct && pendingUnits > 0 ? <ReceiveAll org={org} contractId={id} purchaseId={purchaseId} /> : undefined}
        className="p-0"
      >
        <div className={`${DETAIL_GRID} border-b bg-surface-strong/60 px-4 py-2 caps font-medium text-muted-foreground max-lg:hidden`}>
          <span>N.º</span>
          <span>Código</span>
          <span>Producto</span>
          <span className="text-right">Cant.</span>
          <span className="text-right">Costo s/IVA</span>
          <span className="text-right">IVA %</span>
          <span className="text-right">Subtotal</span>
          <span className="text-right">Recepción</span>
        </div>
        <ul className="divide-y">
          {rows.map(({ l, a, item, code }, i) => {
            const pending = Number(l.quantity) - Number(l.received_qty);
            return (
              <li key={l.id} className="px-4 py-1">
                <div className={DETAIL_GRID}>
                  <span className="num text-muted-foreground max-lg:hidden">{i + 1}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground max-lg:col-span-2" title={code}>
                    <span className="lg:hidden">Código: </span>{code || "—"}
                  </span>
                  <span className="min-w-0 truncate max-lg:col-span-2" title={item?.name}>
                    <span className="lg:hidden caps text-muted-foreground">Producto: </span>
                    {item?.name ?? "Producto eliminado"}
                  </span>
                  <span className="num text-right"><span className={hint}>Cant. </span>{Number(l.quantity)}</span>
                  <span className="num text-right"><span className={hint}>P. unit. </span>{formatCents(Number(l.unit_cost_cents))}</span>
                  <span className="num text-right"><span className={hint}>IVA </span>{Number(l.vat_rate)}%</span>
                  <span className="num text-right"><span className={hint}>Subtotal </span>{formatCents(a.subtotal)}</span>
                  <div className="flex items-center justify-end gap-2 max-lg:col-span-2">
                    <span className={cn("num whitespace-nowrap", pending === 0 ? "text-foreground" : "text-muted-foreground")}>
                      {pending === 0 && "✓ "}
                      {Number(l.received_qty)} de {Number(l.quantity)}
                    </span>
                    {canAct && pending > 0 && (
                      <ReceiveLine
                        key={`${l.id}:${l.received_qty}`}
                        org={org}
                        contractId={id}
                        purchaseLineId={l.id}
                        pending={pending}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="grid items-start gap-4 border-t p-4 lg:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-col gap-4">
            {xml && <XmlInfoList info={xml} subtotalCents={subtotal} totalCents={subtotal + vat} />}
            <div className="flex flex-wrap items-center gap-2">
              <AttachFiles org={org} contractId={id} source="purchase" sourceId={purchaseId} label={`Factura ${p.number}`} count={filesRes.count ?? 0} />
              {canAct && !received && <DeletePurchase org={org} contractId={id} purchaseId={purchaseId} invoice={p.number} />}
            </div>
          </div>
          <dl className="grid w-full min-w-64 grid-cols-[1fr_auto] gap-x-8 gap-y-1 font-mono text-sm lg:w-auto">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="num text-right">{formatCents(subtotal)}</dd>
            <dt className="text-muted-foreground">IVA</dt>
            <dd className="num text-right">{formatCents(vat)}</dd>
            <dt className="font-medium">Total</dt>
            <dd className="num text-right font-medium">{formatCents(subtotal + vat)}</dd>
          </dl>
        </div>
      </PageSection>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="caps text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

export function PurchaseDetailPage({ params }: { params: PurchaseParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Detail params={params} />
    </Suspense>
  );
}

// Retomar un borrador: abre el formulario con lo guardado.
async function Edit({ params }: { params: PurchaseParams }) {
  await connection();
  const { org, id, purchaseId } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, number, supplier_id, purchased_on, notes, status, xml_info")
    .eq("id", purchaseId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!purchase) notFound();
  const p = purchase as { xml_info: Record<string, unknown> | null; id: string; number: string | null; supplier_id: string | null; purchased_on: string; notes: string | null; status: string };
  if (p.status !== "draft") redirect(`/${org}/contratos/${id}/compras/${purchaseId}`);
  if (found.c.status !== "in_progress") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          Las compras se registran cuando el contrato está <strong className="text-foreground">En ejecución</strong>.
        </p>
      </PageSection>
    );
  }

  const [linesRes, supRes] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select("item_id, quantity, unit_cost_cents, line_total_cents, vat_rate, xml_code, xml_description, create_item, new_part_number, new_name, verified")
      .eq("purchase_id", purchaseId)
      .order("position"),
    supabase.from("suppliers").select("id, name").eq("organization_id", found.orgId).order("name"),
  ]);
  const lines = (linesRes.data ?? []) as {
    item_id: string | null;
    quantity: number;
    unit_cost_cents: number;
    line_total_cents: number | null;
    vat_rate: number;
    xml_code: string | null;
    xml_description: string | null;
    create_item: boolean;
    new_part_number: string | null;
    new_name: string | null;
    verified: boolean;
  }[];
  const itemIds = [...new Set(lines.flatMap((l) => (l.item_id ? [l.item_id] : [])))];
  const { data: itemRows } = itemIds.length
    ? await supabase.from("items").select("id, name, sku, part_numbers").in("id", itemIds)
    : { data: [] };
  const items = new Map(
    ((itemRows ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [
      i.id,
      { id: i.id, name: i.name, sku: i.sku, partNumbers: i.part_numbers ?? [], prices: [] },
    ]),
  );

  const draft: DraftData = {
    id: p.id,
    supplierId: p.supplier_id ?? "",
    number: p.number ?? "",
    date: p.purchased_on,
    notes: p.notes ?? "",
    xmlInfo: p.xml_info
      ? {
          fileName: String(p.xml_info.file_name ?? ""),
          accessKey: String(p.xml_info.access_key ?? ""),
          authorization: String(p.xml_info.authorization ?? ""),
          authorizedAt: String(p.xml_info.authorized_at ?? ""),
          buyerRuc: String(p.xml_info.buyer_ruc ?? ""),
          buyerName: String(p.xml_info.buyer_name ?? ""),
          subtotalCents: Number(p.xml_info.subtotal_cents ?? 0),
          totalCents: Number(p.xml_info.total_cents ?? 0),
        }
      : null,
    rows: lines.map((l) => ({
      item: (l.item_id && items.get(l.item_id)) || null,
      quantity: String(Number(l.quantity)),
      cost: centsToInput(Number(l.unit_cost_cents)),
      vat: String(Number(l.vat_rate)),
      total: l.line_total_cents === null ? undefined : Number(l.line_total_cents),
      xml: l.xml_code || l.xml_description ? { code: l.xml_code ?? "", description: l.xml_description ?? "" } : undefined,
      code: l.new_part_number ?? l.xml_code ?? "",
      name: l.new_name ?? l.xml_description ?? "",
      create: l.create_item,
      verified: l.verified,
    })),
  };
  return <PurchaseForm org={org} contractId={id} suppliers={(supRes.data ?? []) as { id: string; name: string }[]} draft={draft} />;
}

export function PurchaseEditPage({ params }: { params: PurchaseParams }) {
  return (
    <>
      <h1 className="sr-only">Borrador de factura de compra</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <Edit params={params} />
      </Suspense>
    </>
  );
}
