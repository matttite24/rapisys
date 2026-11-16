"use client";

import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LineForm } from "@/components/contract-line-form";
import { Button } from "@/components/ui/button";

// Los items se agregan aquí mismo, en Abastecimiento. Crea la línea con los datos del
// producto en la lista abierta (la misma acción que Listas); la tabla se actualiza al guardar.
export function AddLineButton({ open, onToggle, listName }: { open: boolean; onToggle: () => void; listName: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="shrink-0 gap-1.5"
      title={`Los items se agregan a «${listName}» sin cargarlos antes en Listas.`}
      onClick={onToggle}
    >
      <HugeiconsIcon icon={open ? Cancel01Icon : Add01Icon} className="size-4" />
      {open ? "Cerrar" : "Añadir línea"}
    </Button>
  );
}

export function SupplyAddLine({ org, contractId, listId }: { org: string; contractId: string; listId: string }) {
  return (
    <div className="border-b px-4 pt-3 pb-3">
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
  );
}
