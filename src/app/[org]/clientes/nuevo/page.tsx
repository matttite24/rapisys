import { PartyNewPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/clientes/nuevo">) {
  return <PartyNewPage kind="clients" params={params} />;
}
