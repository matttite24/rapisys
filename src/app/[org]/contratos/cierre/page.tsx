import { ContractListPage } from "@/components/contract-list";

export default function Page({ params }: PageProps<"/[org]/contratos/cierre">) {
  return (
    <ContractListPage
      title="Cierre y cobro"
      params={params}
      statuses={["finished", "invoiced", "pending_payment", "paid"]}
      empty="No hay contratos en cierre o cobro."
    />
  );
}
