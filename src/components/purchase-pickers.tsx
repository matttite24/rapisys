"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { searchItems, searchSuppliers, type SupplierOption, type ItemOption } from "@/lib/purchase-actions";
import { SearchInput } from "@/components/search-input";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { cn } from "@/lib/utils";

// Busca un producto de la bodega para la línea de la factura. Los resultados flotan bajo el campo
// para que la fila no crezca.
export function ItemPicker({
  org,
  item,
  initialQuery = "",
  className,
  onPick,
  onRequestChange,
}: {
  org: string;
  item: ItemOption | null;
  initialQuery?: string;
  className?: string;
  onPick: (item: ItemOption) => void;
  onRequestChange?: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchItems(org, text));

  useEffect(() => {
    if (initialQuery.trim()) run(initialQuery, 0);
    // Búsqueda inicial solo al abrir este selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (item) {
    return (
      <div className={cn("flex h-8 min-w-0 items-center justify-between gap-2 border px-3 text-sm", className)}>
        <span className="min-w-0 truncate">
          {item.name}
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {[item.sku, ...item.partNumbers].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-foreground" onClick={onRequestChange} aria-label="Modificar producto vinculado" title="Modificar producto vinculado">
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    // Al salir de este campo (a otra fila, a otro control) la lista de resultados se cierra.
    <div
      className={cn("relative min-w-0", className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clear();
      }}
    >
      <SearchInput
        variant="field"
        label="Producto: busca en la bodega"
        placeholder="Número de parte, SKU o nombre"
        inputClassName="h-8"
        value={q}
        onChange={(v) => {
          setQ(v);
          // Solo busca cuando hay texto: al enfocar el campo vacío no se muestra nada.
          if (v.trim()) run(v);
          else clear();
        }}
        onKeyDown={(e) => e.key === "Escape" && clear()}
      />
      {(results !== null || loading) && (
        <ul
          aria-label="Productos"
          aria-busy={loading}
          // Pulsar la barra de desplazamiento o un espacio de la lista no debe quitarle el foco al campo.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 divide-y overflow-y-auto border bg-popover shadow-overlay transition-opacity",
            loading && results !== null && "opacity-60",
          )}
        >
          {results === null ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="flex flex-col gap-1 px-3 py-2 text-sm text-muted-foreground">
              Ningún producto coincide.
              <Link
                href={`/${org}/bodega/nuevo?parte=${encodeURIComponent(q)}`}
                target="_blank"
                className="text-foreground underline underline-offset-4"
              >
                Crear el producto en la bodega
              </Link>
            </li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onPick(r);
                    clear();
                    setQ("");
                  }}
                >
                  <span>{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {[r.sku, ...r.partNumbers].filter(Boolean).join(" · ") || "Sin SKU ni número de parte"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// Busca el proveedor por nombre o RUC mientras se escribe (con espera, sin una consulta por tecla). Los resultados
// flotan bajo el campo. Ya elegido, muestra el nombre con "Cambiar".
export function SupplierPicker({
  id,
  org,
  selected,
  onPick,
  onClear,
}: {
  id: string;
  org: string;
  selected: { id: string; name: string } | null;
  onPick: (supplier: SupplierOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchSuppliers(org, text));

  if (selected) {
    return (
      <div id={id} className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-base md:text-sm">
        <span className="min-w-0 truncate">{selected.name}</span>
        <Button type="button" variant="ghost" size="sm" className="h-[1.5rem]" onClick={onClear}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clear();
      }}
    >
      <SearchInput
        variant="field"
        id={id}
        label="Proveedor: busca por nombre o RUC"
        placeholder="Busca por nombre o RUC"
        value={q}
        onChange={(v) => {
          setQ(v);
          if (v.trim()) run(v);
          else clear();
        }}
        onKeyDown={(e) => e.key === "Escape" && clear()}
      />
      {(results !== null || loading) && (
        <ul
          aria-label="Proveedores"
          aria-busy={loading}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 divide-y overflow-y-auto border bg-popover shadow-overlay transition-opacity",
            loading && results !== null && "opacity-60",
          )}
        >
          {results === null ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún proveedor coincide. Usa + para crearlo.</li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onPick(r);
                    clear();
                    setQ("");
                  }}
                >
                  <span>{r.name}</span>
                  {r.ruc && <span className="font-mono text-xs text-muted-foreground">{r.ruc}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
