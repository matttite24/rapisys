import { redirectLegacyParty } from "@/lib/redirect-party";
export default async function Page({ params, searchParams }: PageProps<"/[org]/clientes">) {
  return redirectLegacyParty("clients", params, searchParams);
}
