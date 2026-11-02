import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageSection } from "@/components/page-section";
import { PartyForm } from "@/components/party-form";
import { buttonVariants } from "@/components/ui/button";
import { PARTIES, type Party, type PartyKind } from "@/lib/parties";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type IdParams = Promise<{ org: string; id: string }>;

const TH =
  "border-r px-4 py-3 text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground last:border-r-0";
const TD = "border-r px-4 py-3 last:border-r-0";

async function List({ kind, params }: { kind: PartyKind; params: Params }) {
  await connection();
  const cfg = PARTIES[kind];
  const { org } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from(cfg.table)
    .select("id, name, ruc, address")
    .eq("organization_id", orgId)
    .order("name");
  const rows = (data ?? []) as Party[];
  const newHref = `/${org}/${cfg.path}/nuevo`;

  return (
    <PageSection
      label={`${rows.length} ${rows.length === 1 ? cfg.singular : cfg.plural}`}
      className="p-0"
    >
      <HeaderAction icon={Add01Icon} label={cfg.newLabel} href={newHref} prominent />
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
    </PageSection>
  );
}

export function PartyListPage({ kind, params }: { kind: PartyKind; params: Params }) {
  return (
    <>
      <h1 className="sr-only">{PARTIES[kind].heading}</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <List kind={kind} params={params} />
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
