import { ContractListPage } from "@/components/contract-list";

export default function Page({ params }: PageProps<"/[org]/contratos">) {
  return <ContractListPage title="Contratos" params={params} />;
}
