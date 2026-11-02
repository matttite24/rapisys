import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  AddLineForm,
  LinesTable,
  StatusControl,
  type LineView,
} from "@/components/contract-lines";
import { ContractForm } from "@/components/contract-form";
import { CellGrid, PageSection } from "@/components/page-section";
import { PHASE_LABEL, PHASE_ORDER, type Phase } from "@/lib/contracts";
import { addDaysIso, formatIso } from "@/lib/dates";
import { formatCents, lineAmounts } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

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

  const header = (
    <PageSection>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{c.code}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
        </div>
        <StatusControl org={org} contractId={id} status={c.status} />
      </div>
    </PageSection>
  );

  // En estado Nuevo se corrigen los datos del contrato; los items aún no se cargan.
  if (c.status === "new") {
    const [clients, managers] = await Promise.all([
      supabase.from("clients").select("id, name").eq("organization_id", orgId).order("name"),
      supabase.from("contract_managers").select("id, name").eq("organization_id", orgId).order("name"),
    ]);
    return (
      <>
        {header}
        <PageSection>
          <p className="max-w-2xl text-sm text-muted-foreground">
            El contrato está en <strong className="text-foreground">Nuevo</strong>: corrige aquí sus datos
            cuando haga falta. Los items se cargan y se trabajan desde{" "}
            <strong className="text-foreground">En ejecución</strong>.
          </p>
        </PageSection>
        <ContractForm
          org={org}
          clients={clients.data ?? []}
          managers={managers.data ?? []}
          contract={{
            id,
            name: c.name,
            code: c.code,
            clientId: c.client_id,
            managerId: c.manager_id,
            totalCents: Number(c.total_cents),
            startDate: c.start_date,
            termDays: Number(c.term_days),
          }}
        />
      </>
    );
  }

  const [clientRes, managerRes, linesRes] = await Promise.all([
    supabase.from("clients").select("name, ruc").eq("id", c.client_id).maybeSingle(),
    supabase.from("contract_managers").select("name, ruc").eq("id", c.manager_id).maybeSingle(),
    supabase
      .from("contract_items")
      .select("id, item_id, quantity, unit_price_cents, vat_rate, phase, received_qty")
      .eq("contract_id", id)
      .order("created_at"),
  ]);

  type LineRow = {
    id: string;
    item_id: string;
    quantity: number;
    unit_price_cents: number;
    vat_rate: number;
    phase: Phase;
    received_qty: number;
  };
  const lineRows = (linesRes.data ?? []) as LineRow[];

  // Solo los items de este contrato (activos o no), nunca el catálogo completo.
  const { data: itemRows } = lineRows.length
    ? await supabase.from("items").select("id, sku, name").in("id", lineRows.map((l) => l.item_id))
    : { data: [] };
  const itemsById = new Map(
    ((itemRows ?? []) as { id: string; sku: string | null; name: string }[]).map((i) => [i.id, i]),
  );

  const lines: LineView[] = lineRows.map((l) => ({
    id: l.id,
    name: itemsById.get(l.item_id)?.name ?? "Item eliminado",
    sku: itemsById.get(l.item_id)?.sku ?? null,
    quantity: Number(l.quantity),
    unitCents: Number(l.unit_price_cents),
    vatRate: Number(l.vat_rate),
    phase: l.phase,
    received: Number(l.received_qty),
  }));

  // Cada línea se redondea una vez; los totales son sumas de enteros (centavos).
  const amounts = lines.map((l) => lineAmounts(l.quantity, l.unitCents, l.vatRate));
  const subtotal = amounts.reduce((s, a) => s + a.subtotal, 0);
  const vat = amounts.reduce((s, a) => s + a.vat, 0);
  const linesTotal = subtotal + vat;
  const contractTotal = Number(c.total_cents);
  const diff = contractTotal - linesTotal;

  const end = addDaysIso(c.start_date, Number(c.term_days));

  const byPhase = PHASE_ORDER.map((p) => ({ p, n: lines.filter((l) => l.phase === p).length })).filter(
    (x) => x.n > 0,
  );

  return (
    <>
      {header}

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
              {formatIso(c.start_date)} → {end ? formatIso(end) : "—"}
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
          <p className="p-6 text-muted-foreground">
            {c.status === "in_progress"
              ? "Aún no hay items en este contrato. Agrega el primero abajo."
              : "Este contrato no tiene items."}
          </p>
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

      {c.status === "in_progress" && (
        <PageSection label="Agregar item">
          <AddLineForm org={org} contractId={id} vatRate={Number(c.vat_rate)} />
        </PageSection>
      )}
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
