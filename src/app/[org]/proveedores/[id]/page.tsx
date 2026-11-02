import { PartyEditPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/proveedores/[id]">) {
  return <PartyEditPage kind="suppliers" params={params} />;
}
