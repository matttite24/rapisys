import { ContractListPage } from "@/components/contract-list";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos">) {
  return (
    <ContractListPage
      title="Contratos"
      params={params}
      searchParams={searchParams}
      basePath="/contratos"
    />
  );
}
