import { ContractListPage } from "@/components/contract-list";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos/cierre">) {
  return (
    <ContractListPage
      title="Cierre y cobro"
      params={params}
      searchParams={searchParams}
      basePath="/contratos/cierre"
      statuses={["finished", "invoiced", "pending_payment", "paid"]}
      empty="No hay contratos en cierre o cobro."
    />
  );
}
