import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StatusControl } from "@/components/contract-lines";
import { ContractStatusCell } from "@/components/contract-status-cell";
import { HeaderSlot, HeaderTitle } from "@/components/header-action";
import { PanelTop } from "@/components/panel-slots";
import { getContract } from "@/lib/contract-data";
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
  const { data: client } = await supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle();

  const deliveryIso = addDaysIso(c.start_date, Number(c.term_days));
  const summary = {
    code: c.code as string,
    total: formatCents(Number(c.total_cents)),
    delivery: deliveryIso ? formatIso(deliveryIso) : "—",
  };

  return (
    <>
      {/* Cliente y nombre del contrato reemplazan el título del encabezado; estado y pasos van a su derecha. */}
      <HeaderTitle>
        <span className="text-muted-foreground">{client?.name}</span>
        <span aria-hidden className="mx-3 text-muted-foreground">/</span>
        {c.name}
      </HeaderTitle>
      <HeaderSlot>
        <div className="hidden md:block">
          <StatusControl org={org} contractId={id} status={c.status} summary={summary} inHeader />
        </div>
      </HeaderSlot>
      {/* En un contrato, la celda de la organización pasa a mostrar estado y fecha de entrega. */}
      <PanelTop>
        <ContractStatusCell status={c.status} delivery={summary.delivery} />
      </PanelTop>
      <div className="border-b p-4 md:hidden">
        <StatusControl org={org} contractId={id} status={c.status} summary={summary} />
      </div>
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
