"use client";

import { PrinterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

// Abre el diálogo de impresión del navegador (desde ahí se imprime o se guarda como PDF).
export function PrintButton() {
  return (
    <Button className="h-9 gap-2" onClick={() => window.print()}>
      <HugeiconsIcon icon={PrinterIcon} className="size-5" />
      Imprimir / Guardar PDF
    </Button>
  );
}
