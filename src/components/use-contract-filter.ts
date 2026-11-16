"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadContractList } from "@/lib/contract-list-data";
import { CONTRACT_FILTERS, contractFilter, type ContractFilter, type ContractListView } from "@/lib/contract-filters";
import { useListFilterNavigation } from "@/components/list-filter-navigation";

export function useContractFilter(org: string, initial: ContractListView) {
  const source = useMemo(() => ({ org, initial, cache: new Map([[`${initial.filter}:${initial.page}`, initial]]) }), [org, initial]);
  const [selection, setSelection] = useState<{ source: typeof source; view: ContractListView; loading: boolean; error: string } | null>(null);
  const current = selection?.source === source ? selection : { view: initial, loading: false, error: "" };
  const sequence = useRef(0);
  const lifecycle = useRef<{ source: typeof source; active: boolean } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const path = `/${org}/contratos`;
  useEffect(() => {
    const life = { source, active: true };
    const pendingTimers = timers.current;
    lifecycle.current = life;
    return () => { life.active = false; pendingTimers.forEach(clearTimeout); pendingTimers.clear(); };
  }, [source]);

  async function select(filter: ContractFilter, page = 1, updateUrl = true, retry = false) {
    if (!retry && current.view.filter === filter && current.view.page === page && !current.error && !current.loading) return;
    const request = ++sequence.current;
    if (updateUrl) {
      const params = new URLSearchParams(initial.q ? { q: initial.q } : {});
      if (filter) params.set("estado", filter);
      if (page > 1) params.set("page", String(page));
      const href = `${path}${params.size ? `?${params}` : ""}`;
      if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
    }
    let cached = retry ? undefined : source.cache.get(`${filter}:${page}`);
    if (!cached && !retry && initial.filter === "" && initial.page === 1 && initial.total === initial.rows.length && page === 1) {
      const statuses: readonly string[] = CONTRACT_FILTERS[filter].statuses;
      const allowed = new Set(statuses);
      const rows = filter === "credito"
        ? initial.rows.filter((row) => row.kind === "credit")
        : statuses.length ? initial.rows.filter((row) => allowed.has(row.status)) : initial.rows;
      cached = { ...initial, filter, page, rows, total: rows.length };
    }
    if (cached) { setSelection({ source, view: cached, loading: false, error: "" }); return; }
    const view = { ...current.view, filter, page };
    setSelection({ source, view, loading: true, error: "" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 15000);
        timers.current.add(timer);
      });
      const result = await Promise.race([loadContractList(org, initial.q, filter, page), timeout]);
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      if (!result.view) throw new Error(result.error || "No se pudieron cargar los procesos.");
      source.cache.set(`${filter}:${page}`, result.view);
      setSelection({ source, view: result.view, loading: false, error: "" });
    } catch (error) {
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      setSelection({ source, view, loading: false, error: error instanceof Error && error.message !== "timeout" ? error.message : "La consulta está tardando demasiado. Reintenta la carga." });
    } finally { if (timer) { clearTimeout(timer); timers.current.delete(timer); } }
  }
  useListFilterNavigation((href) => {
    const url = new URL(href, window.location.origin);
    if (window.location.pathname !== path || url.pathname !== path || (url.searchParams.get("q") ?? initial.q) !== initial.q) return false;
    void select(contractFilter(url.searchParams.get("estado") ?? ""), 1);
    return true;
  });
  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== path) return;
      const params = new URLSearchParams(window.location.search);
      if ((params.get("q") ?? "") !== initial.q) return;
      void select(contractFilter(params.get("estado") ?? ""), Number(params.get("page") ?? 1), false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  });
  return { ...current.view, loading: current.loading, error: current.error, retry: () => select(current.view.filter, current.view.page, false, true), select };
}
