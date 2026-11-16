"use client";

import { useId, useState } from "react";
import { Cancel01Icon, Store01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { searchQuoteSuppliers, type QuoteSupplier } from "@/lib/quotation-actions";
import { useDebouncedSearch } from "@/lib/use-debounced-search";

// Nombre del proveedor con sugerencias del catálogo. Al elegir uno se completan su teléfono y correo; si se escribe otro
// nombre, queda como texto libre (y se puede guardar como proveedor nuevo).
export function SupplierField({
  org,
  name,
  linked,
  onName,
  onPick,
  onUnlink,
}: {
  org: string;
  name: string;
  linked: boolean;
  onName: (value: string) => void;
  onPick: (supplier: QuoteSupplier) => void;
  onUnlink: () => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchQuoteSuppliers(org, text));
  const open = focused && !linked && name.trim().length > 1 && (loading || results !== null);

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setFocused(false); clear(); } }}>
      <div className="relative">
        <HugeiconsIcon icon={Store01Icon} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="supplier"
          name="supplier"
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={200}
          className="pl-8"
          placeholder="Busca o escribe un proveedor"
          value={name}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            onName(e.target.value);
            if (linked) onUnlink();
            if (e.target.value.trim().length > 1) run(e.target.value);
            else clear();
          }}
          onKeyDown={(e) => e.key === "Escape" && clear()}
        />
        {linked && (
          <button
            type="button"
            aria-label="Quitar el proveedor elegido"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { onUnlink(); onName(""); }}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <ul id={id} aria-label="Proveedores" onMouseDown={(e) => e.preventDefault()} className="absolute top-full right-0 left-0 z-20 mt-1 max-h-56 divide-y overflow-y-auto border bg-popover shadow-overlay">
          {results === null ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ninguno coincide: se usará el nombre que escribes.</li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button type="button" className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { onPick(r); clear(); }}>
                  <span>{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{[r.ruc, r.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
