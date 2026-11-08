import { useCallback, useSyncExternalStore } from "react";

// Columna de opciones abierta o plegada, recordada entre visitas. Sin dato guardado empieza abierta.
const KEY = "rapisys.panel-open";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function usePanelOpen(): [boolean, (open: boolean | ((prev: boolean) => boolean)) => void] {
  const open = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(read()) : next;
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return [open, set];
}
