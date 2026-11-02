export const VAT_RATE = 15;

export const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  in_progress: "En ejecución",
  finished: "Finalizado",
  invoiced: "Facturado",
  pending_payment: "Pendiente de cobro",
  paid: "Cobrado",
};

// Punto de color por fase; el texto siempre acompaña, el color no va solo.
export const STATUS_DOT: Record<string, string> = {
  new: "bg-muted-foreground",
  in_progress: "bg-brand",
  finished: "bg-sky-600",
  invoiced: "bg-violet-600",
  pending_payment: "bg-amber-500",
  paid: "bg-emerald-600",
};

const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
export const formatMoney = (n: number) => money.format(n);

// Acepta "1.234,56", "1,234.56", "1234,56" o "$ 1234.56".
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[\s$]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // El último separador es el decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// El total incluye IVA: se desglosa en subtotal e IVA.
export function splitVat(total: number, rate = VAT_RATE) {
  const subtotal = Math.round((total / (1 + rate / 100)) * 100) / 100;
  return { subtotal, vat: Math.round((total - subtotal) * 100) / 100 };
}
