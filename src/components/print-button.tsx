"use client";

import { PrinterIcon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { PageShortcuts, useModKey } from "@/components/page-shortcuts";

// Imprimir en el encabezado: abre el diálogo de impresión del navegador (desde ahí se imprime o se guarda como PDF).
// El atajo es el de siempre, Ctrl/⌘ + P, que el navegador ya atiende con la misma hoja; aquí solo se muestra en la barra
// de abajo (por eso la acción no usa Alt + N).
export function PrintAction() {
  const mod = useModKey();
  return (
    <>
      <HeaderAction icon={PrinterIcon} label="Imprimir" title={`Imprimir o guardar como PDF (${mod} P)`} onClick={() => window.print()} newShortcut={false} />
      <PageShortcuts shortcuts={[{ keys: [mod, "P"], label: "Imprimir" }]} />
    </>
  );
}
