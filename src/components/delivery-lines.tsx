import type { DeliveryProduct } from "@/lib/line-products";
import { unitLabel } from "@/lib/units";

// Líneas de una entrega: cabecera gris de ancho completo y cada línea un bloque redondeado, como la lista de Abastecimiento.
// El texto va a 24 px del borde (cabecera px-6; filas: 12 de margen + 12 de relleno). La columna «Productos» lista los
// productos reales de la bodega que cubrieron la línea.
const COLS = "3rem minmax(8rem, 1fr) minmax(12rem, 2fr) minmax(16rem, 3fr) 7rem";
const ROW = "grid items-start gap-x-3";

export type DeliveryLine = {
  id: string;
  n: number;
  part_number: string | null;
  description: string;
  unit: string;
  quantity: number;
  // Vacío en una entrega anulada (las líneas volvieron a la bodega y ya no tienen productos asignados).
  products: DeliveryProduct[];
};

function Products({ products, unit }: { products: DeliveryProduct[]; unit: string }) {
  if (products.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-2">
      {products.map((p) => {
        const codes = [p.sku && `SKU ${p.sku}`, p.partNumbers.length > 0 && p.partNumbers.join(" · ")].filter(Boolean).join(" · ");
        return (
          <li key={p.id} className="min-w-0">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-medium break-words">{p.name}</span>
              {/* Con varios productos se ve cuánto aportó cada uno. */}
              {products.length > 1 && <span className="num shrink-0 text-xs text-muted-foreground">{p.quantity} {unitLabel(unit)}</span>}
            </p>
            {codes && <p className="font-mono text-xs break-words text-muted-foreground">{codes}</p>}
            {p.description && <p className="text-xs break-words whitespace-pre-wrap text-muted-foreground">{p.description}</p>}
            <p className="text-xs text-muted-foreground">{p.supplier || "Sin proveedor"}{p.line ? ` · Línea ${p.line}` : ""}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function DeliveryLines({ lines }: { lines: DeliveryLine[] }) {
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label="Líneas entregadas" className="min-w-[58rem] text-sm">
        <div role="row" style={{ gridTemplateColumns: COLS }} className="grid h-10 items-center gap-x-3 bg-surface-strong px-6 text-xs font-medium text-muted-foreground">
          <div role="columnheader" className="text-right">N.º</div>
          <div role="columnheader">N.º de parte</div>
          <div role="columnheader">Descripción</div>
          <div role="columnheader">Productos entregados</div>
          <div role="columnheader" className="text-right">Cantidad</div>
        </div>
        <div role="rowgroup" className="flex flex-col gap-1.5 px-3 pt-1.5 pb-3">
          {lines.map((l) => (
            <div key={l.id} role="row" style={{ gridTemplateColumns: COLS }} className={`${ROW} rounded-xl bg-foreground/[0.035] px-3 py-3`}>
              <div role="cell" className="num text-right text-muted-foreground">{l.n}</div>
              <div role="cell" className="font-mono text-xs break-words text-muted-foreground">{l.part_number ?? "—"}</div>
              <div role="cell" className="min-w-0 font-medium break-words">{l.description}</div>
              <div role="cell" className="min-w-0"><Products products={l.products} unit={l.unit} /></div>
              <div role="cell" className="num text-right font-medium whitespace-nowrap">
                {l.quantity} <span className="font-sans text-xs font-normal text-muted-foreground">{unitLabel(l.unit)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
