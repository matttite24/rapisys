import { PurchaseNewPage } from "@/components/purchase-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/compras/nueva">) {
  return <PurchaseNewPage params={params} />;
}
