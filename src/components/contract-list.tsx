import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { ContractToolbar, type ContractView } from "@/components/contract-toolbar";
import { Pager } from "@/components/pager";
import { buttonVariants } from "@/components/ui/button";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { PAGE_SIZE, pageRange, readPage } from "@/lib/pagination";

const GRID_PAGE_SIZE = 12;
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
  const sp = await searchParams;
  const page = readPage(sp);
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const view: ContractView = sp.vista === "grid" ? "grid" : "lista";
  // La cuadrícula pagina de a 12 (divisible por 1, 2 y 3 columnas): filas completas en cualquier ancho.
  const size = view === "grid" ? GRID_PAGE_SIZE : PAGE_SIZE;
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
    .range(...pageRange(page, size));
  if (statuses) query = query.in("status", statuses);
  // Sin comas ni paréntesis: no deben romper la expresión del filtro.
  const term = q.replace(/[,()*%\\]/g, " ").trim();
  if (term) query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%`);

  const { data, count } = await query;
  const total = count ?? 0;
  const rows = (data ?? []) as unknown as Row[];
  const newHref = `/${org}/contratos/nuevo`;

  return (
    <PageSection className={view === "grid" ? "flex min-h-[calc(100svh-4rem)] flex-col p-0" : "p-0"}>
      <HeaderAction icon={Add01Icon} label="Nuevo contrato" href={newHref} />
      <ContractToolbar q={q} view={view} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="text-muted-foreground">{q ? "Ningún contrato coincide con la búsqueda." : empty}</p>
          {!q && (
            <Link href={newHref} className={buttonVariants()}>
              Crear contrato
            </Link>
          )}
        </div>
      ) : view === "grid" ? (
        <ul className="grid flex-1 auto-rows-fr sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-r [&>li]:border-b">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/${org}/contratos/${r.id}`}
                className="flex h-full flex-col gap-4 p-5 transition-colors hover:bg-accent/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="num text-xs text-muted-foreground">{r.code}</span>
                  <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.06em]">
                    <span aria-hidden className={`size-2 shrink-0 ${STATUS_DOT[r.status] ?? "bg-muted-foreground"}`} />
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-base font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground">{r.clients?.name}</span>
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-px border bg-border [&>div]:bg-background [&>div]:px-3 [&>div]:py-2">
                  <div className="col-span-3 sm:col-span-1">
                    <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Total</dt>
                    <dd className="num">{formatCents(Number(r.total_cents))}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Plazo</dt>
                    <dd className="num">{r.term_days} d</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Inicio</dt>
                    <dd className="num">{r.start_date}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
          {/* Celdas vacías hasta completar la página: la cuadrícula conserva su forma. */}
          {Array.from({ length: Math.max(0, GRID_PAGE_SIZE - rows.length) }, (_, i) => (
            <li key={`vacio-${i}`} aria-hidden className="min-h-48" />
          ))}
        </ul>
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
      <Pager basePath={`/${org}${basePath}`} page={page} total={total} size={size} always={view === "grid"} params={{ ...(q ? { q } : {}), vista: view }} />
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
