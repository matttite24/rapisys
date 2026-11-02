import { PartyNewPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/proveedores/nuevo">) {
  return <PartyNewPage kind="suppliers" params={params} />;
}
