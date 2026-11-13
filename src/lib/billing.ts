// Reporte de cobro: cálculo por línea con el margen ajustado. Todo en centavos, sin IVA aparte (el costo ya lleva IVA).
import { salePriceCents } from "@/lib/money";

export type BillingInput = {
  costCents: number; // costo con IVA, lo realmente pagado
  referenceCents: number | null; // valor final original (precio ref. de la línea)
  sources: number; // tramos asignados: sin ellos no hay costo
  marginOverride: number | null; // margen ajustado (%), o null si no se tocó
  excluded: boolean;
};

export type BillingRow = {
  // La línea entra en los totales: incluida, con costo conocido y valor final.
  counts: boolean;
  finalCents: number | null;
  profitCents: number | null;
  // Margen que se muestra: el ajustado o, si no se tocó, el real (utilidad ÷ costo).
  marginPct: number | null;
};

export function billingRow(l: BillingInput): BillingRow {
  const hasCost = l.sources > 0;
  const finalCents = l.marginOverride !== null && hasCost ? salePriceCents(l.costCents, l.marginOverride) : l.referenceCents;
  const profitCents = hasCost && finalCents !== null ? finalCents - l.costCents : null;
  const marginPct = l.marginOverride !== null ? l.marginOverride : profitCents !== null && l.costCents > 0 ? (profitCents / l.costCents) * 100 : null;
  return { counts: !l.excluded && hasCost && finalCents !== null, finalCents, profitCents, marginPct };
}

// Totales de un conjunto de líneas ya calculadas.
export function billingTotals(rows: { cost: number; row: BillingRow }[]) {
  const t = rows.reduce(
    (a, r) => (r.row.counts ? { cost: a.cost + r.cost, final: a.final + (r.row.finalCents ?? 0) } : a),
    { cost: 0, final: 0 },
  );
  const profit = t.final - t.cost;
  return { ...t, profit, marginPct: t.cost > 0 ? (profit / t.cost) * 100 : null };
}
