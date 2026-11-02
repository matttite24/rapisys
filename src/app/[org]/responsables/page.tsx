import { PartyListPage } from "@/components/party-pages";

export default function Page({ params }: PageProps<"/[org]/responsables">) {
  return <PartyListPage kind="managers" params={params} />;
}
