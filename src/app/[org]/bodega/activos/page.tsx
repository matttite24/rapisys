import { AssetListPage } from "@/components/asset-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/activos">) {
  return <AssetListPage params={params} />;
}
