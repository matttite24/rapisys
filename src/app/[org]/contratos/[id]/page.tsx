import { ContractDetailPage } from "@/components/contract-detail";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]">) {
  return <ContractDetailPage params={params} />;
}
