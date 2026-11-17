"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LineForm } from "@/components/contract-line-form";
import { Button } from "@/components/ui/button";
import type { SupplyLine } from "@/components/supply-board";

// Datos de la línea abierta en el panel: ocultos hasta tocar «Editar». Usa el mismo formulario que Listas y que
// «Añadir línea» de Abastecimiento, en su versión angosta.
export function LineEditor({ org, contractId, line }: { org: string; contractId: string; line: SupplyLine }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">Datos de la línea</span>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
          <HugeiconsIcon icon={Edit02Icon} className="size-4" />
          Editar
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b px-4 py-3">
      <LineForm
        org={org}
        contractId={contractId}
        listId={line.listId}
        compact
        editing={{
          id: line.id,
          listId: line.listId,
          n: line.n,
          partNumber: line.partNumber,
          internalCode: line.internalCode,
          reference: line.reference,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          referencePriceCents: line.referenceCents,
        }}
        onAdd={() => {}}
        onAdded={() => {}}
        onUpdate={() => {}}
        onDone={() => {
          toast.success("Línea actualizada.");
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
