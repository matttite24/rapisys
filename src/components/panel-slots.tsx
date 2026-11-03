"use client";

import { createContext, useContext, useEffect } from "react";

// Contenido que una pantalla pone en la columna de opciones del shell:
// la celda superior (donde va la organización) y el cuerpo bajo ella.
export const PanelTopContext = createContext<(node: React.ReactNode) => void>(() => {});
export const PanelBodySlotContext = createContext<HTMLElement | null>(null);

// Reemplaza la celda superior de la columna de opciones mientras la página está montada.
// También pasa la columna a modo contextual: en vez de las opciones del módulo,
// muestra un enlace de regreso y el cuerpo que aporte la pantalla.
export function PanelTop({ children }: { children: React.ReactNode }) {
  const setTop = useContext(PanelTopContext);
  useEffect(() => {
    setTop(children);
    return () => setTop(null);
  }, [children, setTop]);
  return null;
}

// Elemento donde la pantalla puede montar su cuerpo (null si la columna está oculta).
export const usePanelBodySlot = () => useContext(PanelBodySlotContext);
