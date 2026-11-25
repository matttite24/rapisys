"use client";

import Link from "next/link";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HeaderSlot } from "@/components/header-action";
import { Button, buttonVariants } from "@/components/ui/button";

// Piezas comunes de los formularios de página (items, activos, clientes, responsables, proveedores): Cancelar y Guardar
// en el encabezado, y el error general como banda sobre las secciones.

// Cancelar y Guardar en el encabezado. El botón envía el formulario con ese `id` aunque esté fuera de él.
export function FormPageActions({ formId, cancelHref, pending }: { formId: string; cancelHref: string; pending: boolean }) {
  return (
    <HeaderSlot>
      <div className="flex h-full items-stretch">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" }) + " h-auto! self-stretch px-4"}>
          Cancelar
        </Link>
        <Button type="submit" form={formId} disabled={pending} className="-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5">
          <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </HeaderSlot>
  );
}

// Error general del guardado (los de cada campo salen junto a su campo).
export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error}
    </div>
  );
}
