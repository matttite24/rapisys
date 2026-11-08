import { redirectLegacyParty } from "@/lib/redirect-party";
export default async function Page({ params, searchParams }: PageProps<"/[org]/directorio/clientes">) {
  return redirectLegacyParty("clients", params, searchParams);
}
