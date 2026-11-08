import { redirect } from "next/navigation";

export default async function Page({ params, searchParams }: PageProps<"/[org]/bodega/activos">) {
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams({ vista: "activos" });
  for (const key of ["q", "page"]) {
    const value = Array.isArray(search[key]) ? search[key][0] : search[key];
    if (value) next.set(key, value);
  }
  redirect(`/${org}/bodega?${next}`);
}
