import { PageLoading } from "@/components/page-loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { purchaseState } from "@/lib/purchase-state";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageSection } from "@/components/page-section";
import { PageFigures } from "@/components/page-shortcuts";
import { AttachFiles } from "@/components/attach-files";
import { DeletePurchase } from "@/components/purchase-actions-ui";
import { NewPurchaseForm, PurchaseForm } from "@/components/purchase-form";
import type { DraftData } from "@/components/purchase-form-model";
import { XmlInfoList } from "@/components/xml-info";
import { ReceiveAll, ReceiveLine, ReceiveShortcuts } from "@/components/receive-controls";
import { CreateListFromPurchase } from "@/components/purchase-create-list";
import { PurchasePayments } from "@/components/purchase-payments";
import { PurchaseTabs } from "@/components/purchase-tabs";
import { paymentState, type AdvanceOption, type BankOption, type Movement } from "@/lib/payments";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { getContract } from "@/lib/contract-data";
import { formatIso, todayEcuador } from "@/lib/dates";
import { centsToInput, formatCents, lineAmounts, vatOf } from "@/lib/money";
import { supplierNames } from "@/lib/supplier-names";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;
type PurchaseParams = Promise<{ org: string; id: string; purchaseId: string }>;

const NEW_BTN = (org: string, id: string) => (
  <Link href={`/${org}/contratos/${id}/compras/nueva`} className={cn(buttonVariants(), "h-10")}>
    Subir factura
  </Link>
);

// Lista de facturas de compra del proceso.
async function List({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);

  const [found, pRes, totRes] = await Promise.all([
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
  const supplier = await supplierNames(supabase, purchases.map((p) => p.supplier_id));
  const canAct = found.c.status === "in_progress";

  // Pagos, créditos y anticipos de cada factura, para mostrar su estado de pago.
  const { data: payRows } = purchases.length
    ? await supabase.from("purchase_payments").select("purchase_id, kind, amount_cents, due_on").in("purchase_id", purchases.map((p) => p.id)).limit(5000)
    : { data: [] };
  const byPurchase = new Map<string, { kind: Movement["kind"]; amount_cents: number; due_on: string | null }[]>();
  for (const r of (payRows ?? []) as { purchase_id: string; kind: Movement["kind"]; amount_cents: number; due_on: string | null }[]) {
    byPurchase.set(r.purchase_id, [...(byPurchase.get(r.purchase_id) ?? []), { kind: r.kind, amount_cents: Number(r.amount_cents), due_on: r.due_on }]);
  }
  const today = todayEcuador();

  return (
    <PageSection
      label={`${purchases.length} ${purchases.length === 1 ? "factura" : "facturas"}`}
      className="p-0"
    >
      {canAct && <HeaderAction icon={Upload01Icon} label="Subir factura" href={`/${org}/contratos/${id}/compras/nueva`} />}
      {purchases.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-xl text-muted-foreground">
            Aún no hay facturas de compra en este proceso. Cada factura es de un proveedor: primero se guarda
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
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Por pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => {
                const t = totals.get(p.id);
                const draft = p.status === "draft";
                const total = t ? Number(t.subtotal_cents) + Number(t.vat_cents) : 0;
                const pay = draft || !t ? null : paymentState(total, byPurchase.get(p.id) ?? [], today);
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
                    <TableCell className="whitespace-nowrap">
                      {pay ? (
                        <Link href={`/${org}/contratos/${id}/compras/${p.id}?vista=pagos`} className="inline-flex flex-col gap-0.5">
                          <Badge variant={pay.variant}>{pay.label}</Badge>
                          {pay.dueOn && <span className="text-xs text-muted-foreground">vence {formatIso(pay.dueOn)}</span>}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className={cn("num text-right", pay && pay.owedCents > 0 && "font-medium")}>{pay ? formatCents(pay.owedCents) : "—"}</TableCell>
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
          Las compras se registran cuando el proceso está <strong className="text-foreground">En ejecución</strong>.
        </p>
      </PageSection>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name").eq("organization_id", found.orgId).order("name");
  return <NewPurchaseForm org={org} contractId={id} suppliers={(data ?? []) as { id: string; name: string }[]} />;
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

// Detalle de una factura completa: sus líneas y la recepción de cada una. Asignarla a líneas del proceso se hace
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
    .select("id, number, supplier_id, purchased_on, notes, status, xml_info, list_id")
    .eq("id", purchaseId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!purchase) notFound();
  const p = purchase as { list_id: string | null; id: string; number: string; supplier_id: string; purchased_on: string; notes: string | null; status: string; xml_info: Record<string, unknown> | null };
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

  // Pagos de la factura, anticipos disponibles de este proveedor en el proceso y cuentas de Bancos.
  const [movRes, advRes, bankRes, orgRes] = await Promise.all([
    supabase
      .from("purchase_payments")
      .select("id, kind, amount_cents, moved_on, due_on, method, bank_account_id, advance_id, reference, notes")
      .eq("purchase_id", purchaseId)
      .order("moved_on")
      .order("created_at"),
    supabase
      .from("supplier_advances")
      .select("id, paid_on, amount_cents, reference")
      .eq("contract_id", id)
      .eq("supplier_id", p.supplier_id)
      .order("paid_on")
      .limit(100),
    supabase.from("bank_accounts").select("id, bank, account_number").eq("organization_id", found.orgId).order("bank").limit(200),
    supabase.from("organizations").select("name").eq("id", found.orgId).maybeSingle(),
  ]);
  const banks: BankOption[] = ((bankRes.data ?? []) as { id: string; bank: string; account_number: string }[]).map((b) => ({ id: b.id, label: `${b.bank} · ${b.account_number}` }));
  const bankLabel = new Map(banks.map((b) => [b.id, b.label]));
  const advRows = (advRes.data ?? []) as { id: string; paid_on: string; amount_cents: number; reference: string }[];
  // Cuánto se ha aplicado de cada anticipo, en cualquier factura.
  const { data: appliedRows } = advRows.length
    ? await supabase.from("purchase_payments").select("advance_id, amount_cents").in("advance_id", advRows.map((a) => a.id))
    : { data: [] };
  const applied = new Map<string, number>();
  for (const r of (appliedRows ?? []) as { advance_id: string; amount_cents: number }[]) applied.set(r.advance_id, (applied.get(r.advance_id) ?? 0) + Number(r.amount_cents));
  const advances: AdvanceOption[] = advRows
    .map((a) => ({ a, remaining: Number(a.amount_cents) - (applied.get(a.id) ?? 0) }))
    .filter((x) => x.remaining > 0)
    .map(({ a, remaining }) => ({ id: a.id, remainingCents: remaining, label: `${formatIso(a.paid_on)} · ${formatCents(Number(a.amount_cents))}${a.reference ? ` · ${a.reference}` : ""}` }));
  const advanceRef = new Map(advRows.map((a) => [a.id, `Anticipo ${formatIso(a.paid_on)}`]));
  const movements: Movement[] = ((movRes.data ?? []) as { id: string; kind: Movement["kind"]; amount_cents: number; moved_on: string; due_on: string | null; method: string | null; bank_account_id: string | null; advance_id: string | null; reference: string; notes: string }[]).map((m) => ({
    id: m.id, kind: m.kind, amount_cents: Number(m.amount_cents), moved_on: m.moved_on, due_on: m.due_on, method: m.method,
    bank: m.bank_account_id ? (bankLabel.get(m.bank_account_id) ?? null) : null,
    advance_ref: m.advance_id ? (advanceRef.get(m.advance_id) ?? "Anticipo") : null,
    reference: m.reference, notes: m.notes,
  }));

  return (
    <>
      <ReceiveShortcuts canReceive={canAct && pendingUnits > 0} />
      {/* La cantidad de líneas va en la barra inferior. */}
      <PageFigures figures={[{ label: lines.length === 1 ? "Línea" : "Líneas", value: String(lines.length) }]} />
      <PageSection
        label={`Factura ${p.number}`}
        meta={<AttachFiles org={org} contractId={id} source="purchase" sourceId={purchaseId} label={`Factura ${p.number}`} count={filesRes.count ?? 0} variant="ghost" />}
        className="p-0"
      >
        {/* Volver a la lista, en el encabezado de la página. */}
        <HeaderAction icon={ArrowLeft01Icon} label="Volver" href={`/${org}/contratos/${id}/compras`} secondary />
        {/* Una sola fila: comprador (el de la factura electrónica; sin XML, la organización), proveedor y fecha. */}
        <div className="px-4 py-3">
          <div className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
            <Info
              label="Comprador"
              value={
                xml?.buyerName ? (
                  <>
                    {xml.buyerName}
                    {xml.buyerRuc && <span className="num ml-2 text-muted-foreground">{xml.buyerRuc}</span>}
                  </>
                ) : (
                  (orgRes.data as { name: string } | null)?.name ?? "—"
                )
              }
            />
            <Info label="Proveedor" value={supRes.data?.name ?? "—"} />
            <Info label="Fecha" value={<span className="num">{formatIso(p.purchased_on)}</span>} />
          </div>
        </div>
      </PageSection>

      <PurchaseTabs
        paymentsCount={movements.length}
        // En la fila de pestañas: recibir lo pendiente o, en un proceso a crédito con todo recibido, crear la lista y abastecer.
        actions={
          canAct && pendingUnits > 0 ? (
            <ReceiveAll org={org} contractId={id} purchaseId={purchaseId} />
          ) : canAct && found.c.kind === "credit" && lines.length > 0 ? (
            <CreateListFromPurchase org={org} contractId={id} purchaseId={purchaseId} listId={p.list_id} />
          ) : undefined
        }
        invoice={
        <>
      <PageSection className="p-0">
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
      {/* Las notas van al final de la factura. */}
      {p.notes && (
        <PageSection label="Notas" className="p-0">
          <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm">{p.notes}</p>
        </PageSection>
      )}
        </>
        }
        payments={
        <>
      <PageSection label="Pagos de la factura" className="p-0">
        <PurchasePayments
          org={org}
          contractId={id}
          purchaseId={purchaseId}
          totalCents={subtotal + vat}
          movements={movements}
          advances={advances}
          banks={banks}
          canAct={found.c.status === "in_progress" || found.c.status === "finished" || found.c.status === "invoiced" || found.c.status === "pending_payment"}
        />
      </PageSection>
        </>
        }
      />
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
          Las compras se registran cuando el proceso está <strong className="text-foreground">En ejecución</strong>.
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
