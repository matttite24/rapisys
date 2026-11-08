import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DirectoryBoard, DirectoryError } from "@/components/directory-board";
import { PageLoading } from "@/components/page-loading";
import { loadDirectory } from "@/lib/directory-data";
import { directoryParams, directoryScope } from "@/lib/directory";
import { PAGE_SIZE, pageCount, readPage } from "@/lib/pagination";
type Props = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
async function List({ params, searchParams }: Props) {
  await connection();
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const scope = directoryScope(first(search.grupo) === "responsables" ? "managers" : first(search.tipo) ?? "");
  const result = await loadDirectory(org, scope, first(search.q) ?? "", readPage(search));
  if (!result.view) return <DirectoryError message={result.error ?? "No se pudo cargar el directorio."} />;
  const view = result.view;
  if (view.page > pageCount(view.total, PAGE_SIZE)) redirect(`/${org}/directorio?${directoryParams(view.scope, view.q, pageCount(view.total, PAGE_SIZE))}`);
  return <DirectoryBoard org={org} initial={view} />;
}
export function DirectoryPage(props: Props) { return <Suspense fallback={<PageLoading />}><List {...props} /></Suspense>; }
