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

// El proceso abierto en la columna de opciones: `head` va en la fila del encabezado y `body` (la tarjeta) debajo de ella.
export type PanelCardParts = { head: React.ReactNode; body: React.ReactNode };

// Setter de esas dos partes; lo provee el shell.
export const PanelCardContext = createContext<(parts: PanelCardParts | null) => void>(() => {});

// Muestra el proceso en la columna de opciones mientras la página está montada.
export function PanelCard({ head, body }: PanelCardParts) {
  const setCard = useContext(PanelCardContext);
  useEffect(() => {
    setCard({ head, body });
    return () => setCard(null);
  }, [head, body, setCard]);
  return null;
}
