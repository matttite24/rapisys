"use client";

import { toast } from "sonner";

// Código interno de una línea: el segundo código, como chip. Al tocarlo se copia al portapapeles para buscarlo en la
// bodega o en las facturas.
export function CodeChip({ code }: { code: string }) {
  if (!code) return null;
  return (
    <button
      type="button"
      title="Copiar código interno"
      aria-label={`Copiar código interno ${code}`}
      onClick={async (e) => {
        // En Abastecimiento la fila entera abre el panel: copiar no debe abrirlo.
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(code);
          toast.success(`Copiado: ${code}`);
        } catch {
          toast.error("No se pudo copiar el código.");
        }
      }}
      className="inline-flex h-5 max-w-full cursor-copy items-center rounded-sm border bg-muted px-1.5 align-middle font-mono text-2xs font-medium text-foreground/80 transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="truncate">{code}</span>
    </button>
  );
}
