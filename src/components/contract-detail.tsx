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
import { HeaderSlot, HeaderTitle } from "@/components/header-action";
import { CellGrid, PageSection } from "@/components/page-section";
import { addDaysIso, formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <div className="break-words">{children}</div>
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

  const deliveryIso = addDaysIso(c.start_date, Number(c.term_days));
  const summary = {
    code: c.code as string,
    total: formatCents(Number(c.total_cents)),
    delivery: deliveryIso ? formatIso(deliveryIso) : "—",
  };

  const header = (
    <PageSection>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{c.code}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
        </div>
        <StatusControl org={org} contractId={id} status={c.status} summary={summary} />
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
      .select("id, description, quantity, unit")
      .eq("contract_id", id)
      .order("created_at"),
  ]);

  const lines: LineView[] = (
    (linesRes.data ?? []) as { id: string; description: string; quantity: number; unit: string }[]
  ).map((l) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unit: l.unit }));

  const contractTotal = Number(c.total_cents);
  const end = deliveryIso;

  return (
    <>
      {/* El cliente reemplaza el título del encabezado; estado y pasos van a su derecha. */}
      <HeaderTitle>{clientRes.data?.name}</HeaderTitle>
      <HeaderSlot>
        <div className="hidden md:block">
          <StatusControl org={org} contractId={id} status={c.status} summary={summary} inHeader />
        </div>
      </HeaderSlot>
      <div className="border-b p-4 md:hidden">
        <StatusControl org={org} contractId={id} status={c.status} summary={summary} />
      </div>

      {/* Fila 2: el contrato (código + nombre) y sus datos. */}
      <PageSection className="p-0">
        <CellGrid className="border-0 md:grid-cols-[2fr_1.2fr_1fr_1.2fr]">
          <Cell label="Contrato">
            <h1 className="text-lg leading-snug font-semibold">{c.name}</h1>
            <span className="block font-mono text-xs text-muted-foreground">{c.code}</span>
          </Cell>
          <Cell label="Responsable">
            {managerRes.data?.name}
            {managerRes.data?.ruc && <span className="block font-mono text-xs text-muted-foreground">{managerRes.data.ruc}</span>}
          </Cell>
          <Cell label="Monto del contrato (IVA incl.)">
            <span className="num">{formatCents(contractTotal)}</span>
          </Cell>
          <Cell label="Plazo">
            <span className="num">{c.term_days} {Number(c.term_days) === 1 ? "día" : "días"}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {formatIso(c.start_date)} → {end ? formatIso(end) : "—"}
            </span>
          </Cell>
        </CellGrid>
      </PageSection>

      <PageSection
        label={`${lines.length} ${lines.length === 1 ? "línea" : "líneas"} de referencia`}
        className="p-0"
      >
        {lines.length === 0 ? (
          <p className="p-6 text-muted-foreground">
            {c.status === "in_progress"
              ? "Aún no hay items en la lista del contrato. Agrega el primero abajo."
              : "Este contrato no tiene items."}
          </p>
        ) : (
          <LinesTable org={org} contractId={id} lines={lines} />
        )}
      </PageSection>

      {c.status === "in_progress" && (
        <PageSection label="Agregar item">
          <AddLineForm org={org} contractId={id} />
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
