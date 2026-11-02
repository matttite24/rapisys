import { AssetListPage } from "@/components/asset-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/bodega/activos">) {
  return <AssetListPage params={params} searchParams={searchParams} />;
}
