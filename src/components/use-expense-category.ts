"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadExpenses } from "@/lib/expense-actions";
import type { ExpensePage } from "@/lib/expenses";

export function useExpenseCategory(org: string, contractId: string, q: string, initial: ExpensePage) {
  const source = useMemo(() => ({ initial, org, contractId, q, cache: new Map([[`${initial.category}:${initial.page}`, initial]]) }), [initial, org, contractId, q]);
  const [selection, setSelection] = useState<{ source: typeof source; view: ExpensePage; loading: boolean; error: string } | null>(null);
  const current = selection?.source === source ? selection : { view: initial, loading: false, error: "" };
  const sequence = useRef(0);
  const lifecycle = useRef<{ source: typeof source; active: boolean } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const basePath = `/${org}/contratos/${contractId}/gastos`;

  useEffect(() => {
    const pendingTimers = timers.current;
    const life = { source, active: true };
    lifecycle.current = life;
    return () => { life.active = false; pendingTimers.forEach(clearTimeout); pendingTimers.clear(); };
  }, [source]);

  function resolve(category: string, page: number) {
    const cached = source.cache.get(`${category}:${page}`);
    if (cached) return cached;
    if (initial.category === "" && initial.page === 1 && initial.count === initial.rows.length && page === 1) {
      const rows = category ? initial.rows.filter((row) => row.lines.some((line) => line.category === category)) : initial.rows;
      return { ...initial, rows, category, page, count: rows.length, totalCents: rows.reduce((sum, row) => sum + row.amount_cents, 0) };
    }
    if (initial.allCount === 0) return { ...initial, category, page: 1 };
    return null;
  }

  async function select(category: string, page = 1, updateUrl = true, retry = false) {
    if (!retry && category === current.view.category && page === current.view.page && !current.error && !current.loading) return;
    const request = ++sequence.current;
    if (updateUrl) {
      const params = new URLSearchParams(q ? { q } : {});
      if (category) params.set("categoria", category);
      if (page > 1) params.set("page", String(page));
      const href = `${basePath}${params.size ? `?${params}` : ""}`;
      if (window.location.pathname + window.location.search !== href) window.history.pushState(null, "", href);
    }
    const cached = retry ? null : resolve(category, page);
    if (cached) { setSelection({ source, view: cached, loading: false, error: "" }); return; }
    const view = { ...current.view, category, page };
    setSelection({ source, view, loading: true, error: "" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 15000);
        timers.current.add(timer);
      });
      const result = await Promise.race([loadExpenses(org, contractId, q, category, page), timeout]);
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      if (!result.view) throw new Error(result.error || "No se pudieron cargar los gastos. Inténtalo de nuevo.");
      source.cache.set(`${category}:${page}`, result.view);
      setSelection({ source, view: result.view, loading: false, error: "" });
    } catch (error) {
      if (lifecycle.current?.source !== source || !lifecycle.current?.active || request !== sequence.current) return;
      const message = error instanceof Error && error.message !== "timeout" ? error.message : "La consulta está tardando demasiado. Reintenta la carga.";
      setSelection({ source, view, loading: false, error: message });
    } finally {
      if (timer) { clearTimeout(timer); timers.current.delete(timer); }
    }
  }

  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== basePath) return;
      const params = new URLSearchParams(window.location.search);
      if ((params.get("q") ?? "") !== q) return;
      void select(params.get("categoria") ?? "", Number(params.get("page") ?? 1), false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  });

  return { ...current.view, loading: current.loading, error: current.error, select,
    retry: () => select(current.view.category, current.view.page, false, true) };
}
