import { ContractListPage } from "@/components/contract-list";

export default function Page({ params }: PageProps<"/[org]/contratos/ejecucion">) {
  return (
    <ContractListPage
      title="Contratos en ejecución"
      params={params}
      statuses={["in_progress"]}
      empty="No hay contratos en ejecución."
    />
  );
}
