import { redirect } from "next/navigation";
import type { ContractFilter } from "@/lib/contract-filters";

export async function redirectContractFilter(params: Promise<{ org: string }>, searchParams: Promise<Record<string, string | string[] | undefined>>, filter: ContractFilter): Promise<never> {
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams();
  for (const key of ["q", "page"]) {
    const value = Array.isArray(search[key]) ? search[key][0] : search[key];
    if (value) next.set(key, value);
  }
  if (filter) next.set("estado", filter);
  redirect(`/${org}/contratos?${next}`);
}
