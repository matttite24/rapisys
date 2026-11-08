import { ContractProfitPage } from "@/components/contract-profit";

export default function Page({ params, searchParams }: PageProps<"/[org]/contratos/[id]/revision">) {
  return <ContractProfitPage params={params} searchParams={searchParams} />;
}
