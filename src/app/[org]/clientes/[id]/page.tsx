import { PartyEditPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/clientes/[id]">) {
  return <PartyEditPage kind="clients" params={params} />;
}
