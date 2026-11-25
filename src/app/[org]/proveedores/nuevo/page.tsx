import { redirectLegacyParty } from "@/lib/redirect-party";
export default async function Page({ params, searchParams }: PageProps<"/[org]/proveedores/nuevo">) {
  return redirectLegacyParty("suppliers", params, searchParams, "new");
}
