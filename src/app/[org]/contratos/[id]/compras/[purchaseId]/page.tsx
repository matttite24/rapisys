import { PurchaseDetailPage } from "@/components/purchase-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/compras/[purchaseId]">) {
  return <PurchaseDetailPage params={params} />;
}
