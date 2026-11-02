import { PartyNewPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/responsables/nuevo">) {
  return <PartyNewPage kind="managers" params={params} />;
}
