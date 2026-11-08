import { MAX_CENTS, parseCents } from "@/lib/money";

export const EXPENSE_CATEGORIES = {
  food: "Alimentación", transport: "Transporte", lodging: "Hospedaje", fuel: "Combustible",
  labor: "Mano de obra", supplies: "Insumos", other: "Otros",
} as const;
export const PAYMENT_METHODS = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", other: "Otro" } as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export type ExpenseLine = { id?: string; concept: string; category: ExpenseCategory; amount_cents: number };
export type Expense = {
  id: string; spent_on: string; concept: string; category: ExpenseCategory; amount_cents: number;
  lines: ExpenseLine[];
  payee: string; payment_method: PaymentMethod; document_ref: string; document_url: string; notes: string;
};
export type ExpenseValues = Omit<Expense, "id" | "concept" | "category" | "amount_cents">;
export const MAX_EXPENSE_LINES = 100;
export const EXPENSE_PAGE_SIZE = 25;

export function parseExpense(form: FormData): { values?: ExpenseValues; fields?: Record<string, string> } {
  const text = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
  const spent_on = text("spent_on"), payment_method = text("payment_method");
  const payee = text("payee"), document_ref = text("document_ref"), document_url = text("document_url"), notes = text("notes");
  const fields: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spent_on) || !Number.isFinite(Date.parse(`${spent_on}T00:00:00Z`)) || new Date(`${spent_on}T00:00:00Z`).toISOString().slice(0, 10) !== spent_on) fields.spent_on = "Elige una fecha válida.";
  if (!Object.hasOwn(PAYMENT_METHODS, payment_method)) fields.payment_method = "Elige un método de pago.";
  if (payee.length > 200) fields.payee = "Máximo 200 caracteres.";
  if (document_ref.length > 100) fields.document_ref = "Máximo 100 caracteres.";
  if (notes.length > 2000) fields.notes = "Máximo 2000 caracteres.";
  if (document_url) {
    try {
      const url = new URL(document_url);
      if (document_url.length > 2000 || !["https:", "http:"].includes(url.protocol) || /\s/.test(document_url)) throw new Error();
    } catch { fields.document_url = "Escribe un enlace válido (https://…)."; }
  }
  let rawLines: unknown;
  try { rawLines = JSON.parse(text("lines")); } catch { fields.lines = "Añade al menos una línea de gasto."; }
  const lines: ExpenseLine[] = [];
  if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > MAX_EXPENSE_LINES) {
    fields.lines = `El documento debe tener entre 1 y ${MAX_EXPENSE_LINES} líneas.`;
  } else {
    rawLines.forEach((raw, index) => {
      const row = raw && typeof raw === "object" ? raw : {};
      const concept = typeof row.concept === "string" ? row.concept.trim() : "";
      const category = typeof row.category === "string" ? row.category : "";
      const amount = parseCents(typeof row.amount === "string" ? row.amount : "");
      if (!concept || concept.length > 200) fields[`lines.${index}.concept`] = "Escribe un concepto de hasta 200 caracteres.";
      if (!Object.hasOwn(EXPENSE_CATEGORIES, category)) fields[`lines.${index}.category`] = "Elige una categoría.";
      if (!amount.ok) fields[`lines.${index}.amount`] = amount.error;
      else if (amount.cents <= 0) fields[`lines.${index}.amount`] = "El monto debe ser mayor a 0.";
      lines.push({ concept, category: category as ExpenseCategory, amount_cents: amount.cents ?? 0 });
    });
    if (lines.reduce((sum, row) => sum + row.amount_cents, 0) > MAX_CENTS) fields.lines = "El total del documento es demasiado grande.";
  }
  if (Object.keys(fields).length) return { fields };
  return { values: { spent_on, payment_method: payment_method as PaymentMethod, lines, payee, document_ref, document_url, notes } };
}

export type ExpensePage = {
  rows: Expense[]; count: number; totalCents: number; allCount: number; allTotalCents: number;
  category: string; page: number;
};
