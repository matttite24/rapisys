import { DeliveryViewPage } from "@/components/delivery-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/entregas/[deliveryId]">) {
  return <DeliveryViewPage params={params} />;
}
