import { PurchaseListPage } from "@/components/purchase-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/compras">) {
  return <PurchaseListPage params={params} />;
}
