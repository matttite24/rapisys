import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AssetForm, type AssetData } from "@/components/asset-form";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { buttonVariants } from "@/components/ui/button";
import { ASSET_KIND_LABEL } from "@/lib/items";
import { pageRange, readPage } from "@/lib/pagination";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type IdParams = Promise<{ org: string; id: string }>;


async function List({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const { org } = await params;
  const page = readPage(await searchParams);
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("assets")
    .select("id, kind, name, brand, model, year, plate", { count: "exact" })
    .eq("organization_id", orgId)
    .order("kind")
    .order("name")
    .range(...pageRange(page));
  const rows = (data ?? []) as AssetData[];
  const total = count ?? 0;
  const newHref = `/${org}/bodega/activos/nuevo`;

  return (
    <PageSection label={`${total} ${total === 1 ? "activo" : "activos"}`} className="p-0">
      <HeaderAction icon={Add01Icon} label="Nuevo activo" href={newHref} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="text-muted-foreground">
            Todavía no hay activos. Registra los vehículos y la maquinaria a los que sirven tus items.
          </p>
          <Link href={newHref} className={buttonVariants()}>
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Tipo</th>
                <th scope="col" className={TH}>Nombre</th>
                <th scope="col" className={TH}>Marca / modelo</th>
                <th scope="col" className={`${TH} text-right`}>Año</th>
                <th scope="col" className={TH}>Placa / código</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={TD}>{ASSET_KIND_LABEL[r.kind]}</td>
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/bodega/activos/${r.id}`}
                      className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={TD}>{[r.brand, r.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className={`${TD} num text-right`}>{r.year ?? "—"}</td>
                  <td className={`${TD} num`}>{r.plate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath={`/${org}/bodega/activos`} page={page} total={total} />
    </PageSection>
  );
}

export function AssetListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">Activos</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <List params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewForm({ params }: { params: Params }) {
  await connection();
  const { org } = await params;
  return <AssetForm org={org} />;
}

export function AssetNewPage({ params }: { params: Params }) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo activo</h1>
      </PageSection>
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
  const { data } = await supabase
    .from("assets")
    .select("id, kind, name, brand, model, year, plate")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) notFound();

  const role = await getMyRole(orgId);
  return <AssetForm org={org} asset={data as AssetData} canDelete={role === "admin"} />;
}

export function AssetEditPage({ params }: { params: IdParams }) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">Editar activo</h1>
      </PageSection>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}
