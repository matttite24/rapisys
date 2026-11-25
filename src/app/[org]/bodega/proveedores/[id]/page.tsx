import { PartyEditPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/proveedores/[id]">) {
  return <PartyEditPage kind="suppliers" params={params} />;
}
