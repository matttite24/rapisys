import { PartyListPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/proveedores">) {
  return <PartyListPage kind="suppliers" params={params} />;
}
