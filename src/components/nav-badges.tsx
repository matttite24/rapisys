"use client";

import { createContext, useContext, useEffect } from "react";

// Contadores que el menú de opciones del contrato muestra a la derecha de una sección (por ejemplo, cuántas listas
// tiene). Cada clave es el tramo de la ruta de la sección ("items"). El layout del contrato los registra.
export const NavBadgesContext = createContext<Record<string, number>>({});
export const NavBadgesSetContext = createContext<(badges: Record<string, number>) => void>(() => {});

export function NavBadges({ badges }: { badges: Record<string, number> }) {
  const set = useContext(NavBadgesSetContext);
  const sig = JSON.stringify(badges);
  useEffect(() => {
    set(JSON.parse(sig) as Record<string, number>);
    return () => set({});
  }, [sig, set]);
  return null;
}

export function NavBadge({ n }: { n: number }) {
  return <span className="num ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground/80">{n}</span>;
}
