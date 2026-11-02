import { PartyListPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/clientes">) {
  return <PartyListPage kind="clients" params={params} />;
}
