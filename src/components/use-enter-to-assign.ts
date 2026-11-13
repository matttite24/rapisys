import { useEffect, useRef } from "react";
import type { Reconcile } from "@/components/use-reconcile";
import { Target } from "@/components/reconcile-shared";

// Enter asigna el producto elegido a la línea abierta. Se escucha en toda la ventana mientras el panel está abierto, no solo
// con el foco dentro de la lista: al tocar un producto la fila se vuelve a dibujar y el foco puede quedar fuera.
// No actúa si se escribe en el buscador u otro campo (menos la cantidad), ni dentro de un diálogo, ni sobre otros botones.
export function useEnterToAssign(rc: Reconcile, target: Target) {
  const latest = useRef({ rc, target });
  useEffect(() => {
    latest.current = { rc, target };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const { rc, target } = latest.current;
      if (!rc.current || rc.busy || rc.review) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest('[role="dialog"]') || t.isContentEditable) return;
        if (t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
        if (t.tagName === "INPUT" && t.getAttribute("aria-label") !== "Cantidad a asignar") return;
        // Un botón con su propia acción (cerrar, pestañas, Asignar…) maneja su Enter; solo la fila elegida es "neutra".
        if (t.tagName === "BUTTON" && !t.hasAttribute("aria-pressed")) return;
      }
      e.preventDefault();
      void (target.addToListId ? rc.addToList(target.addToListId) : rc.assign(target));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
