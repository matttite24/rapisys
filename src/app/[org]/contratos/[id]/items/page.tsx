import { ContractItemsPage } from "@/components/contract-items";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos/[id]/items">) {
  return <ContractItemsPage params={params} searchParams={searchParams} />;
}
