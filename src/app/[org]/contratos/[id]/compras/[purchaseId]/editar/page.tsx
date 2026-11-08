import { PurchaseEditPage } from "@/components/purchase-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/compras/[purchaseId]/editar">) {
  return <PurchaseEditPage params={params} />;
}
