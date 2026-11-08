import { PartyNewPage } from "@/components/party-pages";
export default function Page({ params, searchParams }: PageProps<"/[org]/directorio/clientes/nuevo">) {
  return <PartyNewPage kind="clients" params={params} searchParams={searchParams} />;
}
