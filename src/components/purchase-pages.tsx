import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection, TABLE_TD as TD, TABLE_TH as TH } from "@/components/page-section";
import { DeletePurchase } from "@/components/purchase-actions-ui";
import { PurchaseForm } from "@/components/purchase-form";
import { buttonVariants } from "@/components/ui/button";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { formatCents, lineAmounts } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;
type PurchaseParams = Promise<{ org: string; id: string; purchaseId: string }>;

const NEW_BTN = (org: string, id: string) => (
  <Link href={`/${org}/contratos/${id}/compras/nueva`} className={cn(buttonVariants(), "h-10")}>
    Nueva factura
  </Link>
);

// Lista de facturas de compra del contrato.
async function List({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const supabase = await createClient();

  const [pRes, totRes, supRes] = await Promise.all([
    supabase
      .from("purchases")
      .select("id, number, supplier_id, purchased_on")
      .eq("contract_id", id)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("purchase_totals")
      .select("purchase_id, lines, units, subtotal_cents, vat_cents, unassigned")
      .eq("contract_id", id)
      .limit(200),
    supabase.from("suppliers").select("id, name"),
  ]);
  const purchases = (pRes.data ?? []) as { id: string; number: string; supplier_id: string; purchased_on: string }[];
  const totals = new Map(
    ((totRes.data ?? []) as {
      purchase_id: string;
      lines: number;
      units: number;
      subtotal_cents: number;
      vat_cents: number;
      unassigned: number;
    }[]).map((t) => [t.purchase_id, t]),
  );
  const supplier = new Map(((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const canAct = found.c.status === "in_progress";

  return (
    <PageSection
      label={`${purchases.length} ${purchases.length === 1 ? "factura" : "facturas"}`}
      meta={canAct ? NEW_BTN(org, id) : undefined}
      className="p-0"
    >
      {purchases.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-xl text-muted-foreground">
            Aún no hay facturas de compra en este contrato. Cada factura es de un proveedor y se asigna, en todo o en
            parte, a las líneas de las listas. Lo que sobre queda para la bodega.
          </p>
          {canAct && NEW_BTN(org, id)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Factura</th>
                <th scope="col" className={TH}>Fecha</th>
                <th scope="col" className={TH}>Proveedor</th>
                <th scope="col" className={`${TH} text-right`}>Líneas</th>
                <th scope="col" className={`${TH} text-right`}>Unidades</th>
                <th scope="col" className={`${TH} text-right`}>Sin asignar</th>
                <th scope="col" className={`${TH} text-right`}>Total c/IVA</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const t = totals.get(p.id);
                return (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-accent/60">
                    <td className={`${TD} p-0`}>
                      <Link
                        href={`/${org}/contratos/${id}/compras/${p.id}`}
                        className="block px-4 py-3 font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {p.number}
                      </Link>
                    </td>
                    <td className={`${TD} num whitespace-nowrap`}>{formatIso(p.purchased_on)}</td>
                    <td className={TD}>{supplier.get(p.supplier_id) ?? "—"}</td>
                    <td className={`${TD} num text-right`}>{t ? Number(t.lines) : 0}</td>
                    <td className={`${TD} num text-right`}>{t ? Number(t.units) : 0}</td>
                    <td className={cn(TD, "num text-right", t && Number(t.unassigned) > 0 && "font-medium")}>
                      {t ? Number(t.unassigned) : 0}
                    </td>
                    <td className={`${TD} num text-right`}>
                      {t ? formatCents(Number(t.subtotal_cents) + Number(t.vat_cents)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}

export function PurchaseListPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
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
      <PageSection>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva factura de compra</h1>
      </PageSection>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <NewForm params={params} />
      </Suspense>
    </>
  );
}

// Detalle de una factura: sus líneas y a qué líneas del contrato se asignó cada una.
async function Detail({ params }: { params: PurchaseParams }) {
  await connection();
  const { org, id, purchaseId } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, number, supplier_id, purchased_on, notes")
    .eq("id", purchaseId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!purchase) notFound();
  const p = purchase as { id: string; number: string; supplier_id: string; purchased_on: string; notes: string | null };

  const [linesRes, supRes] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select("id, item_id, quantity, unit_cost_cents, vat_rate, received_qty")
      .eq("purchase_id", purchaseId)
      .order("id"),
    supabase.from("suppliers").select("name").eq("id", p.supplier_id).maybeSingle(),
  ]);
  const lines = (linesRes.data ?? []) as {
    id: string;
    item_id: string;
    quantity: number;
    unit_cost_cents: number;
    vat_rate: number;
    received_qty: number;
  }[];

  const [itemsRes, srcRes] = await Promise.all([
    lines.length
      ? supabase.from("items").select("id, name, sku").in("id", [...new Set(lines.map((l) => l.item_id))])
      : { data: [] },
    lines.length
      ? supabase.from("supply_sources").select("purchase_line_id, contract_item_id, quantity").in("purchase_line_id", lines.map((l) => l.id))
      : { data: [] },
  ]);
  const itemById = new Map(((itemsRes.data ?? []) as { id: string; name: string; sku: string | null }[]).map((i) => [i.id, i]));
  const sources = (srcRes.data ?? []) as { purchase_line_id: string; contract_item_id: string; quantity: number }[];

  const { data: targetRows } = sources.length
    ? await supabase
        .from("contract_item_supply")
        .select("id, list_id, n")
        .in("id", [...new Set(sources.map((s) => s.contract_item_id))])
    : { data: [] };
  const targets = (targetRows ?? []) as { id: string; list_id: string; n: number }[];
  const { data: listRows } = targets.length
    ? await supabase.from("contract_lists").select("id, name").in("id", [...new Set(targets.map((t) => t.list_id))])
    : { data: [] };
  const listName = new Map(((listRows ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  const targetById = new Map(targets.map((t) => [t.id, `Línea ${t.n} · ${listName.get(t.list_id) ?? ""}`]));

  const rows = lines.map((l) => {
    const a = lineAmounts(Number(l.quantity), Number(l.unit_cost_cents), Number(l.vat_rate));
    const mine = sources.filter((s) => s.purchase_line_id === l.id);
    const assigned = mine.reduce((s, x) => s + Number(x.quantity), 0);
    return { l, a, mine, assigned };
  });
  const subtotal = rows.reduce((s, r) => s + r.a.subtotal, 0);
  const vat = rows.reduce((s, r) => s + r.a.vat, 0);
  const received = lines.some((l) => Number(l.received_qty) > 0);
  const canAct = found.c.status === "in_progress";

  return (
    <>
      <PageSection className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 md:grid-cols-4">
            <Info label="Factura" value={<span className="font-mono">{p.number}</span>} />
            <Info label="Fecha" value={<span className="num">{formatIso(p.purchased_on)}</span>} />
            <Info label="Proveedor" value={supRes.data?.name ?? "—"} />
            <Info label="Notas" value={p.notes ?? "—"} />
          </div>
          <Link href={`/${org}/contratos/${id}/compras`} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
            ← Facturas
          </Link>
        </div>
      </PageSection>

      <PageSection label={`${lines.length} ${lines.length === 1 ? "línea" : "líneas"}`} className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Producto</th>
                <th scope="col" className={`${TH} text-right`}>Cantidad</th>
                <th scope="col" className={`${TH} text-right`}>Costo unit.</th>
                <th scope="col" className={`${TH} text-right`}>IVA</th>
                <th scope="col" className={`${TH} text-right`}>Subtotal</th>
                <th scope="col" className={TH}>Asignado a</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, a, mine, assigned }) => {
                const item = itemById.get(l.item_id);
                const surplus = Number(l.quantity) - assigned;
                return (
                  <tr key={l.id} className="border-b align-top last:border-b-0">
                    <td className={TD}>
                      {item?.name ?? "Producto eliminado"}
                      {item?.sku && <span className="block font-mono text-xs text-muted-foreground">{item.sku}</span>}
                    </td>
                    <td className={`${TD} num text-right`}>{Number(l.quantity)}</td>
                    <td className={`${TD} num text-right`}>{formatCents(Number(l.unit_cost_cents))}</td>
                    <td className={`${TD} num text-right`}>{Number(l.vat_rate)}%</td>
                    <td className={`${TD} num text-right`}>{formatCents(a.subtotal)}</td>
                    <td className={TD}>
                      {mine.length === 0 && <span className="text-muted-foreground">Sin asignar</span>}
                      {mine.map((s, i) => (
                        <span key={i} className="block">
                          {targetById.get(s.contract_item_id) ?? "—"} <span className="num text-muted-foreground">× {Number(s.quantity)}</span>
                        </span>
                      ))}
                      {mine.length > 0 && surplus > 0 && (
                        <span className="block text-muted-foreground">
                          Sobrante para la bodega: <span className="num">{surplus}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-8 gap-y-1 border-t p-6 font-mono text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="num text-right">{formatCents(subtotal)}</dd>
          <dt className="text-muted-foreground">IVA</dt>
          <dd className="num text-right">{formatCents(vat)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="num text-right font-medium">{formatCents(subtotal + vat)}</dd>
        </dl>
        {canAct && !received && (
          <div className="flex flex-wrap items-center gap-3 border-t p-4">
            <DeletePurchase org={org} contractId={id} purchaseId={purchaseId} invoice={p.number} />
          </div>
        )}
      </PageSection>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
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
