// Rentabilidad: utilidad por línea = precio referencial (total de la fila) − costo de compra;
// utilidad del proceso = suma de las utilidades − gastos. Todo sin IVA, en centavos.
export type ProfitLine = {
  referenceCents: number | null;
  costCents: number;
  unknown: number; // tramos asignados sin costo conocido
  sources: number; // tramos asignados
};

export type LineProfit =
  | { kind: "none" } // sin precio referencial: no se puede calcular
  | { kind: "pending" } // todavía no se asignó nada: no hay costo
  // marginPct: utilidad sobre el precio; markupPct: utilidad sobre el costo (el «margen» de la bodega).
  | { kind: "ok" | "partial"; profitCents: number; marginPct: number | null; markupPct: number | null };

export function lineProfit(l: ProfitLine): LineProfit {
  if (l.referenceCents === null) return { kind: "none" };
  if (l.sources === 0) return { kind: "pending" };
  const profitCents = l.referenceCents - l.costCents;
  return {
    kind: l.unknown > 0 ? "partial" : "ok",
    profitCents,
    marginPct: l.referenceCents > 0 ? (profitCents / l.referenceCents) * 100 : null,
    markupPct: l.costCents > 0 ? (profitCents / l.costCents) * 100 : null,
  };
}

// Cifras de un grupo de líneas ya agregadas (la base las suma por lista) y gastos del proceso.
export type ProfitTotals = { reference: number; cost: number; pending: number; noPrice: number; partial: number };

export function summarizeProfit(groups: ProfitTotals[], expensesCents: number) {
  const t = groups.reduce(
    (a, g) => ({
      reference: a.reference + g.reference,
      cost: a.cost + g.cost,
      pending: a.pending + g.pending,
      noPrice: a.noPrice + g.noPrice,
      partial: a.partial + g.partial,
    }),
    { reference: 0, cost: 0, pending: 0, noPrice: 0, partial: 0 },
  );
  const itemsProfit = t.reference - t.cost;
  const profit = itemsProfit - expensesCents;
  return { ...t, itemsProfit, expenses: expensesCents, profit, marginPct: t.reference > 0 ? (profit / t.reference) * 100 : null };
}
