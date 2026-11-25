import { redirect } from "next/navigation";
import { PARTIES, partyListHref } from "@/lib/parties";
export async function redirectLegacyParty(kind: "clients" | "managers" | "suppliers", params: Promise<{ org: string; id?: string }>, searchParams: Promise<Record<string, string | string[] | undefined>>, action?: "new" | "edit"): Promise<never> {
  const [{ org, id }, search] = await Promise.all([params, searchParams]);
  const target = action === "new" ? `/${org}/${PARTIES[kind].path}/nuevo` : action === "edit" && id ? `/${org}/${PARTIES[kind].path}/${id}` : partyListHref(org, kind);
  const url = new URL(target, "http://local");
  for (const key of ["q", "page", "tipo"]) {
    const value = Array.isArray(search[key]) ? search[key][0] : search[key];
    if (value) url.searchParams.set(key, value);
  }
  redirect(url.pathname + url.search);
}
