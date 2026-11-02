import { ContractListPage } from "@/components/contract-list";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos/ejecucion">) {
  return (
    <ContractListPage
      title="Contratos en ejecución"
      params={params}
      searchParams={searchParams}
      basePath="/contratos/ejecucion"
      statuses={["in_progress"]}
      empty="No hay contratos en ejecución."
    />
  );
}
