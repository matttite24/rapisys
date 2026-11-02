import { PartyListPage } from "@/components/party-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/responsables">) {
  return <PartyListPage kind="managers" params={params} searchParams={searchParams} />;
}
