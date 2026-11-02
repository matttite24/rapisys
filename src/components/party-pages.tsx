import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { PartyForm } from "@/components/party-form";
import { Pager } from "@/components/pager";
import { pageRange, readPage } from "@/lib/pagination";
import { buttonVariants } from "@/components/ui/button";
import { PARTIES, type Party, type PartyKind } from "@/lib/parties";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type IdParams = Promise<{ org: string; id: string }>;


async function List({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams: Search }) {
  await connection();
  const cfg = PARTIES[kind];
  const { org } = await params;
  const page = readPage(await searchParams);
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data, count } = await supabase
    .from(cfg.table)
    .select("id, name, ruc, address", { count: "exact" })
    .eq("organization_id", orgId)
    .order("name")
    .range(...pageRange(page));
  const rows = (data ?? []) as Party[];
  const total = count ?? 0;
  const newHref = `/${org}/${cfg.path}/nuevo`;

  return (
    <PageSection
      label={`${total} ${total === 1 ? cfg.singular : cfg.plural}`}
      className="p-0"
    >
      <HeaderAction icon={Add01Icon} label={cfg.newLabel} href={newHref} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="text-muted-foreground">{cfg.empty}</p>
          <Link href={newHref} className={buttonVariants()}>
            {cfg.newLabel}
          </Link>
        </div>
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
      <Pager basePath={`/${org}/${cfg.path}`} page={page} total={total} />
    </PageSection>
  );
}

export function PartyListPage({ kind, params, searchParams }: { kind: PartyKind; params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">{PARTIES[kind].heading}</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <List kind={kind} params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewForm({ kind, params }: { kind: PartyKind; params: Params }) {
  await connection();
  const { org } = await params;
  return <PartyForm kind={kind} org={org} />;
}

export function PartyNewPage({ kind, params }: { kind: PartyKind; params: Params }) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">{PARTIES[kind].newLabel}</h1>
      </PageSection>
      <Suspense>
        <NewForm kind={kind} params={params} />
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
  const { data } = await supabase
    .from(cfg.table)
    .select("id, name, ruc, address")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) notFound();

  const role = await getMyRole(orgId);
  return <PartyForm kind={kind} org={org} party={data as Party} canDelete={role === "admin"} />;
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
