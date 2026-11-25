import { redirectLegacyParty } from "@/lib/redirect-party";
// La dirección vieja de Proveedores (ahora dentro de Bodega).
export default async function Page({ params, searchParams }: PageProps<"/[org]/proveedores">) {
  return redirectLegacyParty("suppliers", params, searchParams);
}
