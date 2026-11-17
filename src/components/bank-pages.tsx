import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { BankForm } from "@/components/bank-form";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { HeaderAction } from "@/components/header-action";
import { PageLoading } from "@/components/page-loading";
import { PageSection } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBar, UrlSearch } from "@/components/url-search";
import { ACCOUNT_TYPES, type BankAccount } from "@/lib/banks";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatCents } from "@/lib/money";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type IdParams = Promise<{ org: string; id: string }>;

async function List({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const { org } = await params;
  const sp = await searchParams;
  const page = readPage(sp);
  const q = cleanSearch((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "");
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  let query = supabase
    .from("bank_accounts")
    .select("id, bank, account_type, account_number, initial_cents, manager_id", { count: "exact" })
    .eq("organization_id", orgId)
    .order("bank")
    .order("account_number")
    .range(...pageRange(page));
  if (q) query = query.or(`bank.ilike.%${q}%,account_number.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) {
    logDbError("bancos: listado", error);
    return <p role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron cargar las cuentas."}</p>;
  }
  const rows = (data ?? []) as BankAccount[];
  const total = count ?? 0;

  // Nombre del responsable asociado a cada cuenta.
  const ids = [...new Set(rows.map((r) => r.manager_id).filter((x): x is string => !!x))];
  const { data: ms } = ids.length ? await supabase.from("contract_managers").select("id, name").in("id", ids) : { data: [] };
  const managerName = new Map(((ms ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
  const newHref = `/${org}/bancos/nuevo`;

  return (
    <>
      <SearchBar>
        <UrlSearch q={q} label="Buscar cuentas" placeholder="Buscar por banco o número de cuenta" />
      </SearchBar>
      <PageSection label={`${total} ${total === 1 ? "cuenta" : "cuentas"}${q ? ` para “${q}”` : ""}`} className="p-0">
        <HeaderAction icon={Add01Icon} label="Nueva cuenta" href={newHref} />
        {rows.length === 0 ? (
          q ? (
            <EmptyState fill image={NO_RESULTS_IMAGE}>Ninguna cuenta coincide con la búsqueda.</EmptyState>
          ) : (
            <EmptyState fill image="File Cabinet " action={<Link href={newHref} className={buttonVariants({ variant: "brand" })}>Nueva cuenta</Link>}>
              Todavía no hay cuentas bancarias.
            </EmptyState>
          )
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-transparent">
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo de cuenta</TableHead>
                  <TableHead>Número de cuenta</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-right">Monto inicial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                    <TableCell className="p-0">
                      <Link href={`/${org}/bancos/${r.id}`} className="block px-4 py-3 font-medium underline-offset-4 hover:underline">{r.bank}</Link>
                    </TableCell>
                    <TableCell>{ACCOUNT_TYPES[r.account_type] ?? r.account_type}</TableCell>
                    <TableCell className="num">{r.account_number}</TableCell>
                    <TableCell>{(r.manager_id && managerName.get(r.manager_id)) || "—"}</TableCell>
                    <TableCell className="num text-right">{formatCents(Number(r.initial_cents))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager basePath={`/${org}/bancos`} page={page} total={total} params={q ? { q } : {}} />
      </PageSection>
    </>
  );
}

export function BankListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">Bancos</h1>
      <Suspense fallback={<PageLoading />}>
        <List params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Responsables de contrato para elegir el asociado a la cuenta.
async function managerOptions(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("contract_managers").select("id, name").eq("organization_id", orgId).order("name").limit(500);
  return (data ?? []) as { id: string; name: string }[];
}

async function NewForm({ params }: { params: Params }) {
  await connection();
  const { org } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();
  return <BankForm org={org} managers={await managerOptions(orgId)} />;
}

export function BankNewPage({ params }: { params: Params }) {
  return (
    <>
      <h1 className="sr-only">Nueva cuenta</h1>
      <Suspense>
        <NewForm params={params} />
      </Suspense>
    </>
  );
}

async function EditForm({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();
  const supabase = await createClient();
  const [{ data, error }, managers, role] = await Promise.all([
    supabase.from("bank_accounts").select("id, bank, account_type, account_number, initial_cents, manager_id").eq("id", id).eq("organization_id", orgId).maybeSingle(),
    managerOptions(orgId),
    getMyRole(orgId),
  ]);
  if (error) {
    logDbError("bancos: editar", error);
    return <p role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo cargar la cuenta."}</p>;
  }
  if (!data) notFound();
  const account = { ...(data as BankAccount), initial_cents: Number((data as BankAccount).initial_cents) };
  return <BankForm org={org} account={account} managers={managers} canDelete={role === "admin"} />;
}

export function BankEditPage({ params }: { params: IdParams }) {
  return (
    <>
      <PageSection>
        <h1 className="text-2xl font-semibold tracking-tight">Editar cuenta</h1>
      </PageSection>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}
