"use client";

import { useRef, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Búsqueda dentro de la lista abierta: ocupa la fila desde el inicio. Va al servidor (con una
// pausa corta al escribir) y vuelve a la página 1.
export function LineSearch({ q, onSearch }: { q: string; onSearch: (q: string) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [value, setValue] = useState(q);
  return (
    <div className="relative min-w-0 flex-1">
      <HugeiconsIcon
        icon={Search01Icon}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-6 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        aria-label="Buscar en la lista"
        placeholder="Buscar por número de parte o descripción"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onSearch(e.target.value.trim()), 350);
        }}
        className="h-full w-full bg-transparent pr-4 pl-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background"
      />
    </div>
  );
}
