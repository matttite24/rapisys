import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { WarehouseBoard, WarehouseError } from "@/components/warehouse-board";
import { PageLoading } from "@/components/page-loading";
import { loadWarehouse } from "@/lib/warehouse-data";
import { warehouseKind } from "@/lib/warehouse";
import { PAGE_SIZE, pageCount, readPage } from "@/lib/pagination";
type Props = PageProps<"/[org]/bodega">;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
async function List({ params, searchParams }: Props) {
  await connection();
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const result = await loadWarehouse(org, warehouseKind(first(search.vista) ?? ""), first(search.q) ?? "", readPage(search));
  if (!result.view) return <WarehouseError message={result.error ?? "No se pudo cargar el catálogo."} />;
  const view = result.view;
  if (view.page > pageCount(view.total, PAGE_SIZE)) {
    const params = new URLSearchParams({ ...(view.q ? { q: view.q } : {}), ...(view.kind !== "items" ? { vista: view.kind } : {}), page: String(pageCount(view.total, PAGE_SIZE)) });
    redirect(`/${org}/bodega?${params}`);
  }
  return <WarehouseBoard org={org} initial={view} />;
}
export function WarehouseListPage(props: Props) {
  return <Suspense fallback={<PageLoading />}><List {...props} /></Suspense>;
}
