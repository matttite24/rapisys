import { ContractFilesPage } from "@/components/contract-files-page";

export default function Page({ params }: PageProps<"/[org]/contratos/[id]/archivos">) {
  return <ContractFilesPage params={params} />;
}
