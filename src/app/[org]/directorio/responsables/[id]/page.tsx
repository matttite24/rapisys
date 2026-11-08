import { PartyEditPage } from "@/components/party-pages";
export default function Page({ params }: PageProps<"/[org]/directorio/responsables/[id]">) {
  return <PartyEditPage kind="managers" params={params} />;
}
