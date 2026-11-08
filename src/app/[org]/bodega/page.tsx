import { WarehouseListPage } from "@/components/warehouse-page";

export default function Page({ params, searchParams }: PageProps<"/[org]/bodega">) {
  return <WarehouseListPage params={params} searchParams={searchParams} />;
}
