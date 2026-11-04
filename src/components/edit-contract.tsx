"use client";

import { useState } from "react";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ContractForm } from "@/components/contract-form";
import { HEADER_CELL_PRESS, HeaderSlot } from "@/components/header-action";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadContractEdit } from "@/lib/contract-form-actions";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadContractEdit>>>;

// Editar los datos del contrato desde el encabezado (nombre, código, cliente, responsable, monto y plazo).
// Los datos del formulario se piden al abrir, no en cada pantalla del contrato.
export function EditContract({ org, contractId }: { org: string; contractId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);

  // Los datos se piden al abrir (en el clic), no en un efecto.
  function openEditor() {
    setOpen(true);
    setData(null);
    setMissing(false);
    void loadContractEdit(org, contractId).then((r) => (r ? setData(r) : setMissing(true)));
  }

  return (
    <>
      <HeaderSlot>
        <span className="flex self-stretch">
          <Button variant="ghost" className={cn("h-auto! gap-2 px-4", HEADER_CELL_PRESS)} onClick={openEditor}>
            <HugeiconsIcon icon={Edit02Icon} className="size-4" />
            Editar
          </Button>
        </span>
      </HeaderSlot>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Editar contrato</SheetTitle>
            <SheetDescription className="sr-only">Corregir el nombre, el cliente, el responsable, el monto y el plazo.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {data ? (
              <ContractForm
                org={org}
                clients={data.clients}
                managers={data.managers}
                contract={data.contract}
                onDone={() => setOpen(false)}
              />
            ) : missing ? (
              <p className="p-6 text-sm text-muted-foreground">No pudimos cargar el contrato.</p>
            ) : (
              <div role="status" aria-label="Cargando" className="flex flex-col gap-4 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
