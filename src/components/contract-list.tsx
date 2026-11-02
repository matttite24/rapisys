import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { buttonVariants } from "@/components/ui/button";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { pageRange, readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

type Row = {
  id: string;
  code: string;
  name: string;
  total_cents: number;
  term_days: number;
  start_date: string;
  status: string;
  clients: { name: string } | null;
};


async function List({
  params,
  searchParams,
  statuses,
  empty,
  basePath,
}: {
  params: Params;
  searchParams: Search;
  statuses?: string[];
  empty: string;
  basePath: string;
}) {
  await connection();
  const { org } = await params;
  const page = readPage(await searchParams);
  const supabase = await createClient();

  // organizations!inner filtra por la organización de la URL.
  let query = supabase
    .from("contracts")
    .select(
      "id, code, name, total_cents, term_days, start_date, status, clients(name), organizations!inner(slug)",
      { count: "exact" },
    )
    .eq("organizations.slug", org)
    .order("created_at", { ascending: false })
    .range(...pageRange(page));
  if (statuses) query = query.in("status", statuses);

  const { data, count } = await query;
  const total = count ?? 0;
  const rows = (data ?? []) as unknown as Row[];
  const newHref = `/${org}/contratos/nuevo`;

  return (
    <PageSection
      label={`${total} ${total === 1 ? "contrato" : "contratos"}`}
      className="p-0"
    >
      <HeaderAction icon={Add01Icon} label="Nuevo contrato" href={newHref} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="text-muted-foreground">{empty}</p>
          <Link href={newHref} className={buttonVariants()}>
            Crear contrato
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
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/contratos/${r.id}`}
                      className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={TD}>{r.clients?.name}</td>
                  <td className={`${TD} num text-right`}>{formatCents(Number(r.total_cents))}</td>
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
      <Pager basePath={`/${org}${basePath}`} page={page} total={total} />
    </PageSection>
  );
}

export function ContractListPage({
  title,
  params,
  searchParams,
  basePath,
  statuses,
  empty = "Todavía no hay contratos.",
}: {
  title: string;
  params: Params;
  searchParams: Search;
  basePath: string;
  statuses?: string[];
  empty?: string;
}) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <List params={params} searchParams={searchParams} statuses={statuses} empty={empty} basePath={basePath} />
      </Suspense>
    </>
  );
}
