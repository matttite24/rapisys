import { isClientType, type Party } from "@/lib/parties";
export type DirectoryScope = "" | "company" | "institution" | "person" | "managers";
export type DirectoryView = { scope: DirectoryScope; rows: Party[]; q: string; page: number; total: number };
export const directoryScope = (value: string): DirectoryScope => value === "managers" ? value : isClientType(value) ? value : "";
export const directoryScopeFromParams = (params: { get: (key: string) => string | null }) => directoryScope(params.get("grupo") === "responsables" ? "managers" : params.get("tipo") ?? "");
export function directoryParams(scope: DirectoryScope, q = "", page = 1) {
  const params = new URLSearchParams(q ? { q } : {});
  if (scope === "managers") params.set("grupo", "responsables");
  else if (scope) params.set("tipo", scope);
  if (page > 1) params.set("page", String(page));
  return params;
}
export function filterDirectory(rows: Party[], scope: DirectoryScope, q: string) {
  const text = q.toLowerCase();
  return rows.filter((row) => (!scope || scope === "managers" || row.client_type === scope) && [row.name, row.ruc, row.address].some((value) => value?.toLowerCase().includes(text)));
}
