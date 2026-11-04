import { ContractSupplyPage } from "@/components/contract-supply";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos/[id]/abastecimiento">) {
  return <ContractSupplyPage params={params} searchParams={searchParams} />;
}
