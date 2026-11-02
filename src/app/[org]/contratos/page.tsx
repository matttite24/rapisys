import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection } from "@/components/page-section";
import { buttonVariants } from "@/components/ui/button";
import { STATUS_DOT, STATUS_LABEL, formatMoney } from "@/lib/contracts";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  code: string;
  name: string;
  total_amount: number;
  term_days: number;
  start_date: string;
  status: string;
  clients: { name: string } | null;
};

const TH =
  "border-r px-4 py-3 text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground last:border-r-0";
const TD = "border-r px-4 py-3 last:border-r-0";

async function ContractList({ params }: { params: PageProps<"/[org]/contratos">["params"] }) {
  await connection();
  const { org } = await params;
  const supabase = await createClient();

  // organizations!inner filtra por la organización de la URL.
  const { data } = await supabase
    .from("contracts")
    .select(
      "id, code, name, total_amount, term_days, start_date, status, clients(name), organizations!inner(slug)",
    )
    .eq("organizations.slug", org)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const newHref = `/${org}/contratos/nuevo`;

  return (
    <PageSection
      label={`${rows.length} ${rows.length === 1 ? "contrato" : "contratos"}`}
      className="p-0"
    >
      <HeaderAction icon={Add01Icon} label="Nuevo contrato" href={newHref} prominent />
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="text-muted-foreground">Todavía no hay contratos.</p>
          <Link href={newHref} className={buttonVariants()}>
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Código</th>
                <th scope="col" className={TH}>Contrato</th>
                <th scope="col" className={TH}>Cliente</th>
                <th scope="col" className={`${TH} text-right`}>Total (IVA incl.)</th>
                <th scope="col" className={`${TH} text-right`}>Plazo</th>
                <th scope="col" className={TH}>Inicio</th>
                <th scope="col" className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={`${TD} num`}>{r.code}</td>
                  <td className={`${TD} font-medium`}>{r.name}</td>
                  <td className={TD}>{r.clients?.name}</td>
                  <td className={`${TD} num text-right`}>{formatMoney(Number(r.total_amount))}</td>
                  <td className={`${TD} num text-right`}>{r.term_days} d</td>
                  <td className={`${TD} num`}>{r.start_date}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.06em]">
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 ${STATUS_DOT[r.status] ?? "bg-muted-foreground"}`}
                      />
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}

export default function ContractsPage({ params }: PageProps<"/[org]/contratos">) {
  return (
    <>
      <h1 className="sr-only">Contratos</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <ContractList params={params} />
      </Suspense>
    </>
  );
}
