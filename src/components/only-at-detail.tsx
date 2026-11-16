"use client";

import { usePathname } from "next/navigation";

// Muestra su contenido solo en la vista de Detalle del proceso (no en Items, Abastecimiento, etc.).
export function OnlyAtDetail({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return /\/contratos\/[0-9a-f-]{36}\/?$/i.test(path) ? children : null;
}
