import { redirectLegacyParty } from "@/lib/redirect-party";
export default async function Page({ params, searchParams }: PageProps<"/[org]/clientes/[id]">) {
  return redirectLegacyParty("clients", params, searchParams, "edit");
}
