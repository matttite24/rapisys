import { DeliveryReportPage } from "@/components/delivery-pages";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/entregas/[deliveryId]">) {
  return <DeliveryReportPage params={params} />;
}
