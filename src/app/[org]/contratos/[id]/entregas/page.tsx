import { DeliveryListPage } from "@/components/delivery-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/entregas">) {
  return <DeliveryListPage params={params} />;
}
