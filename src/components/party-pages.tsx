import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { PageLoading } from "@/components/page-loading";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { PartyForm } from "@/components/party-form";
import { cleanSearch } from "@/lib/search";
import { SearchBar, UrlSearch } from "@/components/url-search";
import { Pager } from "@/components/pager";
import { pageRange, readPage } from "@/lib/pagination";
import { buttonVariants } from "@/components/ui/button";
import { PARTIES, isClientType, type Party, type PartyKind } from "@/lib/parties";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type IdParams = Promise<{ org: string; id: string }>;


async function List({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams: Search }) {
  await connection();
  const cfg = PARTIES[kind];
  const { org } = await params;
  const sp = await searchParams;
  const page = readPage(sp);
  const q = cleanSearch((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "");
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  let query = supabase
    .from(cfg.table)
    .select("id, name, ruc, address", { count: "exact" })
    .eq("organization_id", orgId)
    .order("name")
    .range(...pageRange(page));
  if (q) query = query.or(`name.ilike.%${q}%,ruc.ilike.%${q}%,address.ilike.%${q}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as Party[];
  const total = count ?? 0;
  const newHref = `/${org}/${cfg.path}/nuevo`;

  return (
    <>
    <SearchBar>
      <UrlSearch q={q} label={`Buscar ${cfg.plural}`} placeholder="Buscar por nombre, RUC o dirección" />
    </SearchBar>
    <PageSection
      label={`${total} ${total === 1 ? cfg.singular : cfg.plural}${q ? ` para “${q}”` : ""}`}
      className="p-0"
    >
      <HeaderAction icon={Add01Icon} label={cfg.newLabel} href={newHref} />
      {rows.length === 0 ? (
        q ? (
          <EmptyState fill image={NO_RESULTS_IMAGE}>Ningún {cfg.singular} coincide con la búsqueda.</EmptyState>
        ) : (
        <EmptyState
          fill
          image="File Cabinet "
          action={
            <Link href={newHref} className={buttonVariants({ variant: "brand" })}>
              {cfg.newLabel}
            </Link>
          }
        >
          {cfg.empty}
        </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Nombre</th>
                <th scope="col" className={TH}>RUC / cédula</th>
                <th scope="col" className={TH}>Dirección</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/${cfg.path}/${r.id}`}
                      className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={`${TD} num`}>{r.ruc ?? "—"}</td>
                  <td className={TD}>{r.address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath={`/${org}/${cfg.path}`} page={page} total={total} params={q ? { q } : {}} />
    </PageSection>
    </>
  );
}

export function PartyListPage({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">{PARTIES[kind].heading}</h1>
      <Suspense fallback={<PageLoading />}>
        <List kind={kind} params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewForm({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams?: Search }) {
  await connection();
  const { org } = await params;
  const search = searchParams ? await searchParams : {};
  const type = typeof search.tipo === "string" && isClientType(search.tipo) ? search.tipo : undefined;
  return <PartyForm kind={kind} org={org} defaultClientType={type} />;
}

export function PartyNewPage({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams?: Search }) {
  return (
    <>
      {/* El título lo pone el encabezado de la sección; aquí solo queda para lectores de pantalla. */}
      <h1 className="sr-only">{PARTIES[kind].newLabel}</h1>
      <Suspense>
        <NewForm kind={kind} params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EditForm({ kind, params }: { kind: PartyKind; params: IdParams }) {
  await connection();
  const cfg = PARTIES[kind];
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(cfg.table)
    .select(kind === "clients" ? "id, name, ruc, address, client_type" : "id, name, ruc, address")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) { logDbError("directorio: editar", error); return <p role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo cargar el registro."}</p>; }
  if (!data) notFound();

  const role = await getMyRole(orgId);
  return <PartyForm kind={kind} org={org} party={data as unknown as Party} canDelete={role === "admin"} />;
}

export function PartyEditPage({ kind, params }: { kind: PartyKind; params: IdParams }) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">
          Editar {PARTIES[kind].singular}
        </h1>
      </PageSection>
      <Suspense>
        <EditForm kind={kind} params={params} />
      </Suspense>
    </>
  );
}
