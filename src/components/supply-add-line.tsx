"use client";

import { useState } from "react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LineForm } from "@/components/contract-line-form";
import { Button } from "@/components/ui/button";

// Proceso a crédito: los items se agregan aquí mismo, en Abastecimiento. Crea la línea con los datos del
// producto en la lista abierta (la misma acción que Listas); la tabla se actualiza al guardar.
export function SupplyAddLine({ org, contractId, listId, listName }: { org: string; contractId: string; listId: string; listName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Proceso a crédito: los items se agregan a «{listName}» sin cargarlos antes en Listas.</span>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
          <HugeiconsIcon icon={open ? Cancel01Icon : Add01Icon} className="size-4" />
          {open ? "Cerrar" : "Añadir línea"}
        </Button>
      </div>
      {open && (
        <div className="pt-3 pb-1">
          <LineForm
            key={listId}
            org={org}
            contractId={contractId}
            listId={listId}
            editing={null}
            onAdd={() => {}}
            onAdded={() => {}}
            onUpdate={() => {}}
            onDone={() => {}}
          />
        </div>
      )}
    </div>
  );
}
