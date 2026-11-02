import { PartyListPage } from "@/components/party-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/proveedores">) {
  return <PartyListPage kind="suppliers" params={params} searchParams={searchParams} />;
}
