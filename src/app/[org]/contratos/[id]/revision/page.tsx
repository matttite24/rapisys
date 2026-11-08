import { ContractProfitPage } from "@/components/contract-profit";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/revision">) {
  return <ContractProfitPage params={params} />;
}
