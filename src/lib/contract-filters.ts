export const CONTRACT_FILTERS = {
  "": { title: "Todos los contratos", statuses: [] as string[], empty: "Todavía no hay contratos." },
  nuevos: { title: "Contratos nuevos", statuses: ["new"], empty: "No hay contratos nuevos." },
  ejecucion: { title: "Contratos en ejecución", statuses: ["in_progress"], empty: "No hay contratos en ejecución." },
  cierre: { title: "Por cobrar", statuses: ["finished", "invoiced", "pending_payment"], empty: "No hay contratos por cobrar." },
  credito: { title: "Procesos a crédito", statuses: [] as string[], empty: "No hay procesos a crédito." },
  cobrados: { title: "Contratos cobrados", statuses: ["paid"], empty: "Todavía no hay contratos cobrados." },
} as const;
export type ContractFilter = keyof typeof CONTRACT_FILTERS;
export const contractFilter = (value: string): ContractFilter => Object.hasOwn(CONTRACT_FILTERS, value) ? value as ContractFilter : "";
export type ContractRow = {
  id: string; code: string; name: string; kind?: string; total_cents: number | null; term_days: number | null; start_date: string; status: string;
  clients: { name: string } | null; contract_managers: { name: string } | null;
};
export type ContractListView = { rows: ContractRow[]; total: number; filter: ContractFilter; page: number; q: string };

export function activeNavigationHref(path: string, hrefs: string[], search: { get: (key: string) => string | null }) {
  return hrefs.filter((href) => {
    const [base, query] = href.split("?");
    return (path === base || path.startsWith(`${base}/`)) && [...new URLSearchParams(query)].every(([key, value]) => (key === "vista" && value === "activos" && base === "/bodega" && (path === "/bodega/activos" || path.startsWith("/bodega/activos/"))) || (key === "grupo" && value === "responsables" && base === "/directorio" && path.startsWith("/directorio/responsables/")) || search.get(key) === value);
  }).sort((a, b) => b.length - a.length)[0];
}
