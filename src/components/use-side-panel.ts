import { useSyncExternalStore } from "react";

// Columna lateral derecha abierta (la de asignar, por ejemplo). Quien la abre lo avisa aquí para que la columna de
// opciones se pliegue y deje espacio.
let rightOpen = false;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function setRightPanelOpen(open: boolean) {
  if (rightOpen === open) return;
  rightOpen = open;
  listeners.forEach((l) => l());
}

export function useRightPanelOpen() {
  return useSyncExternalStore(subscribe, () => rightOpen, () => false);
}

// Pantalla angosta: por debajo de 1280 px la columna de opciones empieza plegada.
export function useNarrowScreen() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 1279px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 1279px)").matches,
    () => false,
  );
}
