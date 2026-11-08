"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useListFilterNavigation } from "@/components/list-filter-navigation";
import { loadDirectory } from "@/lib/directory-data";
import { filterDirectory, directoryParams, directoryScopeFromParams, type DirectoryScope, type DirectoryView } from "@/lib/directory";
import { cleanSearch } from "@/lib/search";
const key = (scope: string, q: string, page: number) => JSON.stringify([scope, q, page]);

export function useDirectoryView(org: string, initial: DirectoryView) {
  const source = useMemo(() => ({ org, initial, cache: new Map([[key(initial.scope, initial.q, initial.page), initial]]) }), [org, initial]);
  const [selection, setSelection] = useState<{ source: typeof source; view: DirectoryView; loading: boolean; error: string } | null>(null);
  const current = selection?.source === source ? selection : { view: initial, loading: false, error: "" };
  const lifecycle = useRef<{ source: typeof source; active: boolean } | null>(null);
  const sequence = useRef(0), timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const path = `/${org}/directorio`;
  useEffect(() => {
    const life = { source, active: true }, pendingTimers = timers.current;
    lifecycle.current = life;
    return () => { life.active = false; pendingTimers.forEach(clearTimeout); pendingTimers.clear(); };
  }, [source]);

  async function select(scope: DirectoryScope, page = 1, search = current.view.q, updateUrl = true, retry = false) {
    const q = cleanSearch(search).slice(0, 200);
    if (!retry && scope === current.view.scope && q === current.view.q && page === current.view.page && !current.loading && !current.error) return;
    const request = ++sequence.current;
    if (updateUrl) {
      const params = directoryParams(scope, q, page);
      const href = `${path}${params.size ? `?${params}` : ""}`;
      if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
    }
    let cached = retry ? undefined : source.cache.get(key(scope, q, page));
    const complete = source.cache.get(key(scope, "", 1)) ?? (scope !== "managers" ? source.cache.get(key("", "", 1)) ?? source.cache.get(key("", q, 1)) : undefined);
    if (!cached && !retry && complete && complete.total === complete.rows.length && page === 1) {
      const rows = filterDirectory(complete.rows, scope, q);
      cached = { scope, q, page, rows, total: rows.length };
    }
    if (cached) { setSelection({ source, view: cached, loading: false, error: "" }); return; }
    const view: DirectoryView = { scope, rows: [], q, page, total: 0 };
    setSelection({ source, view, loading: true, error: "" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); timers.current.add(timer); });
      const result = await Promise.race([loadDirectory(org, scope, q, page), timeout]);
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      if (!result.view) throw new Error(result.error || "No se pudo cargar el catálogo.");
      source.cache.set(key(scope, q, page), result.view);
      setSelection({ source, view: result.view, loading: false, error: "" });
    } catch (error) {
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      setSelection({ source, view, loading: false, error: error instanceof Error && error.message !== "timeout" ? error.message : "La consulta está tardando demasiado. Reintenta la carga." });
    } finally { if (timer) { clearTimeout(timer); timers.current.delete(timer); } }
  }
  useListFilterNavigation((href) => {
    const url = new URL(href, window.location.origin);
    if (window.location.pathname !== path || url.pathname !== path) return false;
    void select(directoryScopeFromParams(url.searchParams), 1, url.searchParams.get("q") ?? current.view.q);
    return true;
  });
  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== path) return;
      const params = new URLSearchParams(window.location.search);
      void select(directoryScopeFromParams(params), Number(params.get("page") ?? 1), params.get("q") ?? "", false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  });
  return { view: current.view, loading: current.loading, error: current.error, select,
    retry: () => select(current.view.scope, current.view.page, current.view.q, false, true) };
}
