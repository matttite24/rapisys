import { PartyNewPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/proveedores/nuevo">) {
  return <PartyNewPage kind="suppliers" params={params} />;
}
