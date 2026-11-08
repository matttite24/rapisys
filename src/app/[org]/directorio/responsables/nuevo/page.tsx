import { PartyNewPage } from "@/components/party-pages";
export default function Page({ params, searchParams }: PageProps<"/[org]/directorio/responsables/nuevo">) {
  return <PartyNewPage kind="managers" params={params} searchParams={searchParams} />;
}
