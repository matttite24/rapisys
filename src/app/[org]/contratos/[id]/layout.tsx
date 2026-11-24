import { Suspense } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Building03Icon } from "@hugeicons/core-free-icons";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StatusControl } from "@/components/status-control";
import { ContractStatusCell } from "@/components/contract-status-cell";
import { HeaderSlot, HeaderTitle } from "@/components/header-action";
import { EditContract } from "@/components/edit-contract";
import { OnlyAtDetail } from "@/components/only-at-detail";
import { NavBadges } from "@/components/nav-badges";
import { PanelCard, PanelTop } from "@/components/panel-slots";
import { ProcessCard, ProcessHead } from "@/components/process-card";
import { getContract } from "@/lib/contract-data";
import { finishBlocker } from "@/lib/contract-completion";
import { addDaysIso, daysLeft, formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Lo común a todas las partes del proceso: cliente y proceso, acciones del encabezado, datos de la columna de opciones y contadores
// (las partes del proceso se cambian desde esa columna; las migas las arma el encabezado).
async function ContractChrome({ params }: { params: LayoutProps<"/[org]/contratos/[id]">["params"] }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { c } = found;

  const supabase = await createClient();
  const [{ data: client }, { data: navCounts }, blocker, { data: billing }] = await Promise.all([
    supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle(),
    // Los seis contadores del menú, en una sola llamada.
    supabase.rpc("contract_nav_counts", { p_contract_id: id }),
    c.status === "in_progress" ? finishBlocker(supabase, id) : Promise.resolve(null),
    // Proceso a crédito: no tiene monto de contrato; su monto es el valor final de lo entregado.
    c.kind === "credit" ? supabase.rpc("contract_billing_totals", { p_contract_id: id }) : Promise.resolve({ data: null }),
  ]);

  const counts = (navCounts ?? {}) as Partial<Record<"lists" | "lines" | "purchases" | "deliveries" | "expenses" | "files", number>>;
  const credit = c.kind === "credit";
  const deliveryIso = credit ? null : addDaysIso(c.start_date, Number(c.term_days));
  const summary = {
    code: c.code as string,
    total: credit ? "—" : formatCents(Number(c.total_cents)),
    delivery: deliveryIso ? formatIso(deliveryIso) : "—",
  };
  // Monto que muestra la columna de opciones: en un proceso a crédito, lo entregado (valor final de las entregas).
  const amount = credit ? formatCents(Number((billing as { final_cents?: number } | null)?.final_cents ?? 0)) : summary.total;

  return (
    <>
      {/* Cliente y proceso: el encabezado los muestra, con las migas debajo, cuando la columna de opciones (con su tarjeta) está oculta. */}
      <HeaderTitle>
        <span className="inline-flex items-center gap-1.5 align-middle">
          <HugeiconsIcon icon={Building03Icon} className="size-4 shrink-0" aria-hidden />
          {client?.name}
        </span>
        <span aria-hidden className="mx-2 text-muted-foreground">/</span>
        <span className="text-foreground">{c.name}</span>
      </HeaderTitle>
      <HeaderSlot>
        <OnlyAtDetail>
          {c.status !== "new" && (
            <div className="hidden self-stretch md:flex">
              <EditContract org={org} contractId={id} />
            </div>
          )}
          <div className="hidden self-stretch md:flex">
            <StatusControl org={org} contractId={id} status={c.status} kind={c.kind} deliveries={counts.deliveries ?? 0} summary={summary} blocker={blocker} inHeader />
          </div>
        </OnlyAtDetail>
      </HeaderSlot>
      {/* Contadores a la derecha de cada sección en el menú de opciones: listas, líneas, facturas y entregas. */}
      <NavBadges
        badges={{
          items: counts.lists ?? 0,
          abastecimiento: counts.lines ?? 0,
          compras: counts.purchases ?? 0,
          entregas: counts.deliveries ?? 0,
          pagos: counts.expenses ?? 0,
          archivos: counts.files ?? 0,
        }}
      />
      {/* El proceso abierto en la columna de opciones: tipo y monto en la fila del encabezado, y debajo la tarjeta con el resto. */}
      <PanelCard
        head={<ProcessHead kind={c.kind} total={amount} />}
        body={<ProcessCard code={c.code as string} name={c.name as string} client={client?.name} status={c.status} kind={c.kind} deliveries={counts.deliveries ?? 0} delivery={summary.delivery} daysLeft={credit || (c.status !== "new" && c.status !== "in_progress") ? null : daysLeft(c.start_date, Number(c.term_days))} />}
      />
      {/* Solo el menú móvil: en escritorio el estado y la fecha están en el encabezado. */}
      <PanelTop>
        <ContractStatusCell status={c.status} delivery={summary.delivery} kind={c.kind} deliveries={counts.deliveries ?? 0} />
      </PanelTop>
      <OnlyAtDetail>
        <div className="border-b p-4 md:hidden print:hidden">
          <StatusControl org={org} contractId={id} status={c.status} kind={c.kind} deliveries={counts.deliveries ?? 0} summary={summary} blocker={blocker} />
        </div>
      </OnlyAtDetail>
    </>
  );
}

export default function ContractLayout({ children, params }: LayoutProps<"/[org]/contratos/[id]">) {
  return (
    <>
      {/* El encabezado y el cambiador cargan aparte: la página no espera por ellos. */}
      <Suspense>
        <ContractChrome params={params} />
      </Suspense>
      {children}
    </>
  );
}
