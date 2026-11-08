"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupplyState } from "@/components/supply-progress";

type Filter = SupplyState | "";
type View<T> = { lines: T[]; total: number; page: number; estado: Filter };

// Solo filtra localmente datos completos. Nunca interpreta una página parcial como una lista completa.
export function useSupplyFilter<T extends { state: SupplyState }>(input: View<T> & {
  counts: Record<SupplyState, number>; activeId: string | null; q: string; basePath: string;
}) {
  const router = useRouter();
  const { lines, total, page, estado, counts, activeId, q, basePath } = input;
  // Una respuesta nueva (también router.refresh tras guardar) invalida las vistas locales.
  const source = useMemo(() => {
    const original = { lines, total, page, estado };
    const complete = estado === "" && page === 1 && total === lines.length;
    return {
      context: { activeId, q },
      original,
      resolve(filter: Filter): View<T> | null {
        if (filter === estado && page === 1) return original;
        if (complete) {
          const filtered = filter ? lines.filter((line) => line.state === filter) : lines;
          return { lines: filtered, total: filtered.length, page: 1, estado: filter };
        }
        if (filter && counts[filter] === 0) return { lines: [], total: 0, page: 1, estado: filter };
        return null;
      },
    };
  }, [lines, total, page, estado, counts, activeId, q]);
  const [selected, setSelected] = useState<{ source: typeof source; view: View<T> } | null>(null);
  const view = selected?.source === source ? selected.view : source.original;

  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== basePath) return;
      const params = new URLSearchParams(window.location.search);
      if ((params.get("lista") ?? activeId) !== activeId || (params.get("q") ?? "") !== q) return;
      const filter = (params.get("estado") ?? "") as Filter;
      const next = Number(params.get("page") ?? 1) === 1 ? source.resolve(filter) : null;
      if (next) setSelected({ source, view: next });
      else router.refresh();
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, activeId, q, basePath, router]);

  function select(filter: Filter, href: string) {
    const next = source.resolve(filter);
    if (!next) return false;
    setSelected({ source, view: next });
    if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
    return true;
  }

  return { ...view, select };
}
