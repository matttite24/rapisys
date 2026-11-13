import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StatusControl } from "@/components/status-control";
import { ContractStatusCell } from "@/components/contract-status-cell";
import { HeaderSlot, HeaderTitle } from "@/components/header-action";
import { EditContract } from "@/components/edit-contract";
import { OnlyAtDetail } from "@/components/only-at-detail";
import { NavBadges } from "@/components/nav-badges";
import { PanelTop } from "@/components/panel-slots";
import { getContract } from "@/lib/contract-data";
import { finishBlocker } from "@/lib/contract-completion";
import { addDaysIso, formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Lo común a todas las partes del contrato: cliente y estado en el encabezado,
// (las partes del contrato se cambian desde la columna de opciones).
async function ContractChrome({ params }: { params: LayoutProps<"/[org]/contratos/[id]">["params"] }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { c } = found;

  const supabase = await createClient();
  const [{ data: client }, { data: navCounts }, blocker] = await Promise.all([
    supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle(),
    // Los seis contadores del menú, en una sola llamada.
    supabase.rpc("contract_nav_counts", { p_contract_id: id }),
    c.status === "in_progress" ? finishBlocker(supabase, id) : Promise.resolve(null),
  ]);

  const counts = (navCounts ?? {}) as Partial<Record<"lists" | "lines" | "purchases" | "deliveries" | "expenses" | "files", number>>;
  const credit = c.kind === "credit";
  const deliveryIso = credit ? null : addDaysIso(c.start_date, Number(c.term_days));
  const summary = {
    code: c.code as string,
    total: credit ? "—" : formatCents(Number(c.total_cents)),
    delivery: deliveryIso ? formatIso(deliveryIso) : "—",
  };

  return (
    <>
      {/* Cliente y nombre del contrato reemplazan el título del encabezado; estado y pasos van a su derecha. */}
      <HeaderTitle>
        <span>{client?.name}</span>
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
      {/* En un contrato, la celda de la organización pasa a mostrar estado y fecha de entrega. */}
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
