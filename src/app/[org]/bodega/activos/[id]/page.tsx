import { AssetEditPage } from "@/components/asset-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/activos/[id]">) {
  return <AssetEditPage params={params} />;
}
