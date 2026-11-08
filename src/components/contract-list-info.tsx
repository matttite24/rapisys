"use client";

import { ConfirmTap } from "@/components/confirm-tap";
import { useState } from "react";
import { Delete02Icon, Edit02Icon, ArrowDown01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AssetFactsLine, AssetFactsWrap, assetFactList } from "@/components/asset-facts";
import { Button } from "@/components/ui/button";
import { deleteList } from "@/lib/contract-list-actions";
import { cn } from "@/lib/utils";
import { ListView } from "@/components/contract-lists-model";

// Dato del activo con su ícono: etiqueta pequeña arriba y valor abajo. El nombre ya está en la pestaña.

// Datos del activo de la lista abierta, con editar y eliminar.
export function ListInfo({
  org,
  contractId,
  list,
  lineCount,
  canEdit,
  editing,
  onEdit,
}: {
  org: string;
  contractId: string;
  list: ListView;
  lineCount: number;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(0);
  const facts = assetFactList(list);

  async function remove() {
    setPending(true);
    setError(undefined);
    try {
      const res = await deleteList(org, contractId, list.id);
      if (res?.error) setError(res.error);
    } finally {
      setPending(false);
    }
  }

  // Una lista general solo tiene nombre: no se muestran datos vacíos.
  const general = !list.assetId;

  return (
    <div className={cn("border-b", editing && "bg-muted")}>
      {/* Mismo alto que la fila de la factura elegida en el panel de asignar (5 rem con su línea). */}
      <div className="flex h-14 items-center justify-between gap-4 pr-6">
        {general ? (
          // Lista general: solo lleva nombre, sin datos de activo (serie, motor, etc.). No hay nada que abrir.
          <div className="flex min-w-0 flex-1 items-center gap-3 pl-6">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-[1.125rem]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Lista general</p>
              <p className="truncate text-xs text-muted-foreground">Sin activo: no lleva datos como serie o motor.</p>
            </div>
          </div>
        ) : (
          // Una sola línea con los datos que caben; si quedan otros, "+N" y un toque los despliega debajo (solo esos, sin repetir).
          facts.length === 0 ? (
            <p className="pl-6 text-sm text-muted-foreground">
              Este activo aún no tiene datos.{canEdit ? " Usa el lápiz para completarlos." : ""}
            </p>
          ) : (
            <div className="flex h-full min-w-0 flex-1 items-center gap-3 pl-6">
              <div className="min-w-0 flex-1 cursor-text select-text">
                <AssetFactsLine facts={facts} onHiddenChange={setHidden} />
              </div>
              {/* Solo el control expande los datos; el texto queda libre para seleccionar y copiar. */}
              <div className="flex w-14 shrink-0 items-center justify-end">
                {hidden > 0 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`datos-${list.id}`}
                    aria-label={expanded ? "Ocultar los demás datos del activo" : `Ver ${hidden} ${hidden === 1 ? "dato más" : "datos más"} del activo`}
                    onClick={() => setExpanded((v) => !v)}
                    className="flex h-9 items-center justify-end gap-1 px-1 text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="num">+{hidden}</span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      aria-hidden
                      className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
                    />
                  </button>
                )}
              </div>
            </div>
          )
        )}
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label="Editar los datos de la lista"
                aria-pressed={editing}
                onClick={onEdit}
              >
                <HugeiconsIcon icon={Edit02Icon} className="size-4" />
              </Button>
              <ConfirmTap
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                aria-label="Eliminar la lista"
                disabled={pending}
                hint={
                  lineCount === 0
                    ? "Toca otra vez para eliminar la lista"
                    : `Toca otra vez: se eliminan también sus ${lineCount} ${lineCount === 1 ? "línea" : "líneas"}`
                }
                onConfirm={() => void remove()}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </ConfirmTap>
            </>
          )}
        </div>
      </div>
      {!general && expanded && hidden > 0 && (
        <div id={`datos-${list.id}`} className="border-t px-6 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <AssetFactsWrap facts={facts.slice(facts.length - hidden)} />
        </div>
      )}
      {error && <p role="alert" className="border-t p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
