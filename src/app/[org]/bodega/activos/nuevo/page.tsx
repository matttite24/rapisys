import { AssetNewPage } from "@/components/asset-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/activos/nuevo">) {
  return <AssetNewPage params={params} />;
}
