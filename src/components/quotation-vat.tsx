import { formatCents, lineAmounts } from "@/lib/money";

// El precio se captura sin IVA; aquí se calcula y se muestra el IVA y el total con IVA, por unidad y por la cantidad
// de la línea.
export function VatBreakdown({ unitCents, quantity, vatRate }: { unitCents: number; quantity: number; vatRate: number }) {
  const unit = lineAmounts(1, unitCents, vatRate);
  const all = lineAmounts(quantity, unitCents, vatRate);
  return (
    <dl className="num grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 border bg-background p-3 text-xs" aria-label="Cálculo con IVA">
      <dt />
      <dd className="text-right font-sans text-muted-foreground">Unidad</dd>
      <dd className="text-right font-sans text-muted-foreground">{quantity} {quantity === 1 ? "unidad" : "unidades"}</dd>
      <dt className="font-sans text-muted-foreground">Sin IVA</dt>
      <dd className="text-right">{formatCents(unit.subtotal)}</dd>
      <dd className="text-right">{formatCents(all.subtotal)}</dd>
      <dt className="font-sans text-muted-foreground">IVA {vatRate}%</dt>
      <dd className="text-right">{formatCents(unit.vat)}</dd>
      <dd className="text-right">{formatCents(all.vat)}</dd>
      <dt className="border-t pt-1 font-sans font-medium">Con IVA</dt>
      <dd className="border-t pt-1 text-right font-semibold">{formatCents(unit.total)}</dd>
      <dd className="border-t pt-1 text-right font-semibold">{formatCents(all.total)}</dd>
    </dl>
  );
}
