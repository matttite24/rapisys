"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useListFilterNavigation } from "@/components/list-filter-navigation";
import { loadWarehouse } from "@/lib/warehouse-data";
import { filterWarehouse, warehouseKind, type WarehouseKind, type WarehouseView } from "@/lib/warehouse";
import { cleanSearch } from "@/lib/search";
const key = (kind: string, q: string, page: number) => JSON.stringify([kind, q, page]);

export function useWarehouseView(org: string, initial: WarehouseView) {
  const source = useMemo(() => ({ org, initial, cache: new Map([[key(initial.kind, initial.q, initial.page), initial]]) }), [org, initial]);
  const [selection, setSelection] = useState<{ source: typeof source; view: WarehouseView; loading: boolean; error: string } | null>(null);
  const current = selection?.source === source ? selection : { view: initial, loading: false, error: "" };
  const lifecycle = useRef<{ source: typeof source; active: boolean } | null>(null);
  const sequence = useRef(0), timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const path = `/${org}/bodega`;
  useEffect(() => {
    const life = { source, active: true }, pendingTimers = timers.current;
    lifecycle.current = life;
    return () => { life.active = false; pendingTimers.forEach(clearTimeout); pendingTimers.clear(); };
  }, [source]);

  async function select(kind: WarehouseKind, page = 1, search = current.view.q, updateUrl = true, retry = false) {
    const q = cleanSearch(search).slice(0, 200);
    if (!retry && kind === current.view.kind && q === current.view.q && page === current.view.page && !current.loading && !current.error) return;
    const request = ++sequence.current;
    if (updateUrl) {
      const params = new URLSearchParams(q ? { q } : {});
      if (kind === "activos") params.set("vista", kind);
      if (page > 1) params.set("page", String(page));
      const href = `${path}${params.size ? `?${params}` : ""}`;
      if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
    }
    let cached = retry ? undefined : source.cache.get(key(kind, q, page));
    const complete = source.cache.get(key(kind, "", 1));
    if (!cached && !retry && complete && complete.total === complete.rows.length && page === 1) cached = filterWarehouse(complete, q);
    if (cached) { setSelection({ source, view: cached, loading: false, error: "" }); return; }
    // Cambia de catálogo inmediatamente, sin presentar filas del catálogo anterior.
    const view: WarehouseView = kind === "items" ? { kind, rows: [], q, page, total: 0 } : { kind, rows: [], q, page, total: 0 };
    setSelection({ source, view, loading: true, error: "" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); timers.current.add(timer); });
      const result = await Promise.race([loadWarehouse(org, kind, q, page), timeout]);
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      if (!result.view) throw new Error(result.error || "No se pudo cargar el catálogo.");
      source.cache.set(key(kind, q, page), result.view);
      setSelection({ source, view: result.view, loading: false, error: "" });
    } catch (error) {
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      setSelection({ source, view, loading: false, error: error instanceof Error && error.message !== "timeout" ? error.message : "La consulta está tardando demasiado. Reintenta la carga." });
    } finally { if (timer) { clearTimeout(timer); timers.current.delete(timer); } }
  }
  useListFilterNavigation((href) => {
    const url = new URL(href, window.location.origin);
    if (window.location.pathname !== path || url.pathname !== path) return false;
    void select(warehouseKind(url.searchParams.get("vista") ?? ""), 1, url.searchParams.get("q") ?? current.view.q);
    return true;
  });
  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== path) return;
      const params = new URLSearchParams(window.location.search);
      void select(warehouseKind(params.get("vista") ?? ""), Number(params.get("page") ?? 1), params.get("q") ?? "", false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  });
  return { view: current.view, loading: current.loading, error: current.error, select,
    retry: () => select(current.view.kind, current.view.page, current.view.q, false, true) };
}
