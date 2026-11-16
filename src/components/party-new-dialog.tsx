"use client";

import { PartyForm } from "@/components/party-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PARTIES, type ClientType, type PartyKind } from "@/lib/parties";

// Alta de un cliente o responsable de proceso en un modal, sobre el directorio. Al guardar, la acción navega a la lista
// (que ya muestra el registro nuevo); Cancelar o Esc cierran sin salir de la pantalla.
export function PartyNewDialog({
  org,
  kind,
  defaultClientType,
  open,
  onOpenChange,
}: {
  org: string;
  kind: PartyKind;
  defaultClientType?: ClientType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-6">
          <DialogTitle>{PARTIES[kind].newLabel}</DialogTitle>
          <DialogDescription className="sr-only">Completa los datos y guarda.</DialogDescription>
        </DialogHeader>
        <PartyForm kind={kind} org={org} defaultClientType={defaultClientType} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
