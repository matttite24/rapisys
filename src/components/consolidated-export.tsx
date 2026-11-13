"use client";

import { useState } from "react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { ExportColumnsDialog } from "@/components/export-columns-dialog";
import { HeaderAction } from "@/components/header-action";

// «Exportar» del encabezado en la pestaña Consolidado: abre el modal de columnas y descarga el Excel de todas las entregas.
export function ConsolidatedExport({ href }: { href: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderAction icon={Download01Icon} label="Exportar" title="Exportar el consolidado de todas las entregas a Excel" secondary onClick={() => setOpen(true)} />
      <ExportColumnsDialog open={open} onOpenChange={setOpen} href={href} consolidated />
    </>
  );
}
