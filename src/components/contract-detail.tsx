import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ContractForm } from "@/components/contract-form";
import { CellGrid, PageSection } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { addDaysIso, formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
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

// Detalle del contrato. El cliente y el estado ya están en el encabezado (layout).
async function Detail({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { orgId, c } = found;
  const supabase = await createClient();

  // En estado Nuevo se corrigen los datos del contrato; los items aún no se cargan.
  if (c.status === "new") {
    const [clients, managers] = await Promise.all([
      supabase.from("clients").select("id, name").eq("organization_id", orgId).order("name"),
      supabase.from("contract_managers").select("id, name").eq("organization_id", orgId).order("name"),
    ]);
    return (
      <>
        <PageSection>
          <h1 className="text-lg leading-snug font-semibold">{c.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
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

  const { data: manager } = await supabase
    .from("contract_managers")
    .select("name, ruc")
    .eq("id", c.manager_id)
    .maybeSingle();
  const end = addDaysIso(c.start_date, Number(c.term_days));

  return (
    <PageSection className="p-0">
      <CellGrid className="border-0 md:grid-cols-[2fr_1.2fr_1fr_1.2fr]">
        <Cell label="Contrato">
          <h1 className="text-lg leading-snug font-semibold">{c.name}</h1>
          <span className="block font-mono text-xs text-muted-foreground">{c.code}</span>
        </Cell>
        <Cell label="Responsable">
          {manager?.name}
          {manager?.ruc && <span className="block font-mono text-xs text-muted-foreground">{manager.ruc}</span>}
        </Cell>
        <Cell label="Monto del contrato (IVA incl.)">
          <span className="num">{formatCents(Number(c.total_cents))}</span>
        </Cell>
        <Cell label="Plazo">
          <span className="num">{c.term_days} {Number(c.term_days) === 1 ? "día" : "días"}</span>
          <span className="block font-mono text-xs text-muted-foreground">
            {formatIso(c.start_date)} → {end ? formatIso(end) : "—"}
          </span>
        </Cell>
      </CellGrid>
    </PageSection>
  );
}

export function ContractDetailPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Detail params={params} />
    </Suspense>
  );
}
