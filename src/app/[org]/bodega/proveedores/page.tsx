import { redirect } from "next/navigation";

// La lista de proveedores es una vista de la bodega (como Activos): esta dirección solo lleva allí.
export default async function Page({ params, searchParams }: PageProps<"/[org]/bodega/proveedores">) {
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams({ vista: "proveedores" });
  for (const key of ["q", "page"]) {
    const value = Array.isArray(search[key]) ? search[key][0] : search[key];
    if (value) next.set(key, value);
  }
  redirect(`/${org}/bodega?${next}`);
}
