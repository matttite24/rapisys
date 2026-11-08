"use client";

import { useState } from "react";
import { HeaderAction } from "@/components/header-action";
import { InviteForm } from "@/components/members-manager";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Add01Icon } from "@hugeicons/core-free-icons";

// "Invitar" en el encabezado de Miembros: abre un modal con el correo y el rol.
export function InviteDialog({ org, days }: { org: string; days: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderAction icon={Add01Icon} label="Invitar" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Invitar a alguien</DialogTitle>
            <DialogDescription>Genera un enlace para un correo. Vence en {days} {days === 1 ? "día" : "días"}.</DialogDescription>
          </DialogHeader>
          <InviteForm org={org} days={days} dialog />
        </DialogContent>
      </Dialog>
    </>
  );
}
