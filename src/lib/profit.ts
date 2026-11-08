// Rentabilidad: utilidad por línea = precio referencial (total de la fila) − costo de compra;
// utilidad del contrato = suma de las utilidades − gastos. Todo sin IVA, en centavos.
export type ProfitLine = {
  referenceCents: number | null;
  costCents: number;
  unknown: number; // tramos asignados sin costo conocido
  sources: number; // tramos asignados
};

export type LineProfit =
  | { kind: "none" } // sin precio referencial: no se puede calcular
  | { kind: "pending" } // todavía no se asignó nada: no hay costo
  | { kind: "ok" | "partial"; profitCents: number; marginPct: number | null };

export function lineProfit(l: ProfitLine): LineProfit {
  if (l.referenceCents === null) return { kind: "none" };
  if (l.sources === 0) return { kind: "pending" };
  const profitCents = l.referenceCents - l.costCents;
  return {
    kind: l.unknown > 0 ? "partial" : "ok",
    profitCents,
    marginPct: l.referenceCents > 0 ? (profitCents / l.referenceCents) * 100 : null,
  };
}

export function contractProfit(lines: ProfitLine[], expensesCents: number) {
  let reference = 0;
  let cost = 0;
  let itemsProfit = 0;
  let pending = 0;
  let noPrice = 0;
  let partial = 0;
  for (const l of lines) {
    const p = lineProfit(l);
    if (p.kind === "none") noPrice++;
    else if (p.kind === "pending") pending++;
    else {
      reference += l.referenceCents ?? 0;
      cost += l.costCents;
      itemsProfit += p.profitCents;
      if (p.kind === "partial") partial++;
    }
  }
  const profit = itemsProfit - expensesCents;
  return {
    reference, // precio referencial de las líneas ya compradas
    cost,
    itemsProfit,
    expenses: expensesCents,
    profit,
    marginPct: reference > 0 ? (profit / reference) * 100 : null,
    pending,
    noPrice,
    partial,
  };
}
