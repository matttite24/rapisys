import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  AddLineForm,
  LinesTable,
  StatusControl,
  type CatalogItem,
  type LineView,
} from "@/components/contract-lines";
import { CellGrid, PageSection } from "@/components/page-section";
import { PHASE_LABEL, PHASE_ORDER, type Phase } from "@/lib/contracts";
import { centsToInput, formatCents, lineAmounts, salePriceCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

const dateFmt = (d: Date) =>
  d.toLocaleDateString("es-EC", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words">{children}</span>
    </div>
  );
}

async function Detail({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!c) notFound();

  const [clientRes, managerRes, linesRes, catalogRes, pricesRes] = await Promise.all([
    supabase.from("clients").select("name, ruc").eq("id", c.client_id).maybeSingle(),
    supabase.from("contract_managers").select("name, ruc").eq("id", c.manager_id).maybeSingle(),
    supabase
      .from("contract_items")
      .select("id, item_id, quantity, unit_price_cents, vat_rate, phase, received_qty")
      .eq("contract_id", id)
      .order("created_at"),
    supabase
      .from("items")
      .select("id, sku, name, margin_percent")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("item_supplier_prices").select("item_id, unit_cost_cents").eq("organization_id", orgId),
  ]);

  const itemsById = new Map(
    ((catalogRes.data ?? []) as { id: string; sku: string | null; name: string; margin_percent: number }[]).map(
      (i) => [i.id, i],
    ),
  );
  // Un item inactivo ya agregado al contrato debe seguir mostrando su nombre.
  const missing = ((linesRes.data ?? []) as { item_id: string }[])
    .map((l) => l.item_id)
    .filter((i) => !itemsById.has(i));
  if (missing.length) {
    const { data } = await supabase.from("items").select("id, sku, name, margin_percent").in("id", missing);
    for (const i of (data ?? []) as { id: string; sku: string | null; name: string; margin_percent: number }[]) {
      itemsById.set(i.id, i);
    }
  }

  const lines: LineView[] = (
    (linesRes.data ?? []) as {
      id: string;
      item_id: string;
      quantity: number;
      unit_price_cents: number;
      vat_rate: number;
      phase: Phase;
      received_qty: number;
    }[]
  ).map((l) => ({
    id: l.id,
    name: itemsById.get(l.item_id)?.name ?? "Item eliminado",
    sku: itemsById.get(l.item_id)?.sku ?? null,
    quantity: Number(l.quantity),
    unitCents: Number(l.unit_price_cents),
    vatRate: Number(l.vat_rate),
    phase: l.phase,
    received: Number(l.received_qty),
  }));

  // Precio sugerido por item: costo más bajo + margen. Solo items aún no agregados.
  const best = new Map<string, number>();
  for (const p of (pricesRes.data ?? []) as { item_id: string; unit_cost_cents: number }[]) {
    const cost = Number(p.unit_cost_cents);
    if (!best.has(p.item_id) || cost < best.get(p.item_id)!) best.set(p.item_id, cost);
  }
  const inContract = new Set(((linesRes.data ?? []) as { item_id: string }[]).map((l) => l.item_id));
  const activeIds = new Set((catalogRes.data ?? []).map((a) => a.id as string));
  const catalog: CatalogItem[] = [...itemsById.values()]
    .filter((i) => activeIds.has(i.id) && !inContract.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      suggested: best.has(i.id) ? centsToInput(salePriceCents(best.get(i.id)!, Number(i.margin_percent))) : "",
    }));

  // Cada línea se redondea una vez; los totales son sumas de enteros (centavos).
  const amounts = lines.map((l) => lineAmounts(l.quantity, l.unitCents, l.vatRate));
  const subtotal = amounts.reduce((s, a) => s + a.subtotal, 0);
  const vat = amounts.reduce((s, a) => s + a.vat, 0);
  const linesTotal = subtotal + vat;
  const contractTotal = Number(c.total_cents);
  const diff = contractTotal - linesTotal;

  const start = new Date(`${c.start_date}T00:00:00Z`);
  const end = new Date(start.getTime() + Number(c.term_days) * 86_400_000);

  const byPhase = PHASE_ORDER.map((p) => ({ p, n: lines.filter((l) => l.phase === p).length })).filter(
    (x) => x.n > 0,
  );

  return (
    <>
      <PageSection>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-sm text-muted-foreground">{c.code}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          </div>
          <StatusControl org={org} contractId={id} status={c.status} />
        </div>
      </PageSection>

      <PageSection className="p-0">
        <CellGrid className="border-0 md:grid-cols-4">
          <Cell label="Cliente">
            {clientRes.data?.name}
            {clientRes.data?.ruc && <span className="block font-mono text-xs text-muted-foreground">{clientRes.data.ruc}</span>}
          </Cell>
          <Cell label="Responsable">
            {managerRes.data?.name}
            {managerRes.data?.ruc && <span className="block font-mono text-xs text-muted-foreground">{managerRes.data.ruc}</span>}
          </Cell>
          <Cell label="Monto del contrato (IVA incl.)">
            <span className="num">{formatCents(contractTotal)}</span>
          </Cell>
          <Cell label="Plazo">
            <span className="num">{c.term_days} d</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {dateFmt(start)} → {dateFmt(end)}
            </span>
          </Cell>
        </CellGrid>
      </PageSection>

      <PageSection
        label={`${lines.length} ${lines.length === 1 ? "línea" : "líneas"}`}
        meta={
          byPhase.length > 0
            ? byPhase.map((x) => `${x.n} ${PHASE_LABEL[x.p].toLowerCase()}`).join(" · ")
            : undefined
        }
        className="p-0"
      >
        {lines.length === 0 ? (
          <p className="p-6 text-muted-foreground">Aún no hay items en este contrato. Agrega el primero abajo.</p>
        ) : (
          <>
            <LinesTable org={org} contractId={id} lines={lines} />
            <div className="grid gap-px border-t bg-border md:grid-cols-4 [&>*]:bg-background [&>*]:p-4">
              <Cell label="Subtotal">
                <span className="num">{formatCents(subtotal)}</span>
              </Cell>
              <Cell label="IVA">
                <span className="num">{formatCents(vat)}</span>
              </Cell>
              <Cell label="Total de líneas (IVA incl.)">
                <span className="num font-medium">{formatCents(linesTotal)}</span>
              </Cell>
              <Cell label="Frente al monto del contrato">
                <span className="num">
                  {diff === 0 ? "Coincide" : diff > 0 ? `Faltan ${formatCents(diff)}` : `Excede en ${formatCents(-diff)}`}
                </span>
              </Cell>
            </div>
          </>
        )}
      </PageSection>

      <PageSection label="Agregar item">
        <AddLineForm org={org} contractId={id} vatRate={Number(c.vat_rate)} catalog={catalog} />
      </PageSection>
    </>
  );
}

export function ContractDetailPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Detail params={params} />
    </Suspense>
  );
}
