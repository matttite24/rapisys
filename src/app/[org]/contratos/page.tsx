import { ContractListPage } from "@/components/contract-list";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos">) {
  return <ContractListPage params={params} searchParams={searchParams} />;
}
