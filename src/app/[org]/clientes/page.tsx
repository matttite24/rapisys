import { PartyListPage } from "@/components/party-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/clientes">) {
  return <PartyListPage kind="clients" params={params} searchParams={searchParams} />;
}
