"use client";

import { createContext, useContext, useEffect } from "react";

// Setter de la celda superior de la columna de opciones; lo provee el shell.
export const PanelTopContext = createContext<(node: React.ReactNode) => void>(() => {});

// Reemplaza el selector de organización de esa celda mientras la página está montada.
export function PanelTop({ children }: { children: React.ReactNode }) {
  const setTop = useContext(PanelTopContext);
  useEffect(() => {
    setTop(children);
    return () => setTop(null);
  }, [children, setTop]);
  return null;
}
