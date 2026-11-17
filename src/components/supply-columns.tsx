"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Columnas opcionales de la tabla de Abastecimiento. N.º y Producto siempre se ven.
export const SUPPLY_COLUMNS = [
  { key: "quantity", label: "Cantidad" },
  { key: "reference", label: "Precio ref." },
  { key: "cost", label: "Costo" },
  { key: "margin", label: "Margen" },
  { key: "state", label: "Estado" },
] as const;
export type SupplyColumn = (typeof SUPPLY_COLUMNS)[number]["key"];

// Las importantes, por defecto: cuánto se pide, cuánto cuesta y cómo va.
const DEFAULT: SupplyColumn[] = ["quantity", "cost", "state"];
// Para la estructura de carga (antes de saber lo guardado).
export const DEFAULT_SUPPLY_COLUMNS: Set<SupplyColumn> = new Set(DEFAULT);
const STORAGE = "abastecimiento:columnas";
const KEYS = new Set<string>(SUPPLY_COLUMNS.map((c) => c.key));

// Columnas visibles, recordadas en este navegador. Si no hay nada guardado (o no se puede leer), las de por defecto.
export function useSupplyColumns() {
  const [cols, setCols] = useState<Set<SupplyColumn>>(() => new Set(DEFAULT));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
      // Se lee después de montar (el servidor no conoce lo guardado): así no hay diferencias al hidratar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setCols(new Set(saved.filter((k): k is SupplyColumn => KEYS.has(k))));
    } catch {
      /* sin almacenamiento: quedan las de por defecto */
    }
  }, []);
  function toggle(key: SupplyColumn) {
    setCols((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      try {
        localStorage.setItem(STORAGE, JSON.stringify([...next]));
      } catch {
        /* no se recuerda, pero el cambio se aplica */
      }
      return next;
    });
  }
  function reset() {
    setCols(new Set(DEFAULT));
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* nada que borrar */
    }
  }
  return { cols, toggle, reset };
}

// Botón de columnas (al inicio de la cabecera de la tabla): casillas para mostrar u ocultar cada columna opcional.
export function SupplyColumnsMenu({ cols, toggle, reset }: ReturnType<typeof useSupplyColumns>) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Elegir columnas"
            title="Elegir columnas"
          />
        }
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">Mostrar en la tabla</p>
        {SUPPLY_COLUMNS.map((c) => (
          <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={cols.has(c.key)} onChange={() => toggle(c.key)} />
            {c.label}
          </label>
        ))}
        <div className="mt-1 border-t pt-1">
          <button type="button" onClick={reset} className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Volver a las de por defecto
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
