import { ContractItemsPage } from "@/components/contract-items";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/items">) {
  return <ContractItemsPage params={params} />;
}
