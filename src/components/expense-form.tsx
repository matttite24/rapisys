"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, MAX_EXPENSE_LINES, type Expense, type ExpenseCategory } from "@/lib/expenses";
import { centsToInput, formatCents, parseCents } from "@/lib/money";
import { saveExpense } from "@/lib/expense-actions";

type LineDraft = { key: number; concept: string; category: ExpenseCategory; amount: string };
export function ExpenseForm({ org, contractId, expense, onClose }: {
  org: string; contractId: string; expense?: Expense; onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(() => expense?.spent_on ?? toIsoDate(new Date()));
  const [lines, setLines] = useState<LineDraft[]>(() => expense
    ? expense.lines.map((line, key) => ({ key, concept: line.concept, category: line.category, amount: centsToInput(line.amount_cents) }))
    : [{ key: 0, concept: "", category: "other", amount: "" }]);
  const nextKey = useRef(lines.length);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const amounts = lines.map((line) => parseCents(line.amount));
  const total = amounts.every((amount) => amount.ok && amount.cents > 0) ? amounts.reduce((sum, amount) => sum + (amount.cents ?? 0), 0) : null;
  function clearLineErrors() {
    setFields((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== "lines" && !key.startsWith("lines."))));
  }
  function changeLine(key: number, change: Partial<LineDraft>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
    clearLineErrors();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("lines", JSON.stringify(lines.map(({ concept, category, amount }) => ({ concept, category, amount }))));
    setSaving(true); setError(""); setFields({});
    try {
      const result = await saveExpense(org, contractId, expense?.id ?? null, data);
      if (!result.ok) {
        setFields(result.fields ?? {}); setError(result.error ?? "");
        const first = Object.keys(result.fields ?? {})[0];
        if (first) requestAnimationFrame(() => form.querySelector<HTMLElement>(`[id="${first}"]`)?.focus());
        return;
      }
      toast.success(expense ? "Documento de gastos actualizado." : "Documento de gastos registrado.");
      onClose(); router.refresh();
    } catch { setError("No se pudo guardar el documento. Inténtalo de nuevo."); }
    finally { setSaving(false); }
  }
  return (
    <>
      <SheetHeader><SheetTitle>{expense ? "Editar documento de gastos" : "Registrar documento de gastos"}</SheetTitle><SheetDescription className="sr-only">Un comprobante con varias líneas de gasto y un total automático.</SheetDescription></SheetHeader>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <fieldset disabled={saving} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField name="spent_on" label="Fecha" error={fields.spent_on}>{(props) => <DatePicker {...props} name="spent_on" value={date} onChange={setDate} />}</FormField>
            <FormField name="payment_method" label="Método de pago" error={fields.payment_method}>{(props) => <NativeSelect {...props} className="w-full" defaultValue={expense?.payment_method ?? ""}><option value="" disabled>Seleccionar…</option>{Object.entries(PAYMENT_METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}</FormField>
          </div>
          <FormField name="payee" label="Pagado a (opcional)" error={fields.payee}>{(props) => <Input {...props} maxLength={200} defaultValue={expense?.payee} placeholder="Persona o empresa" />}</FormField>
          <FormField name="document_ref" label="N.º de comprobante (opcional)" error={fields.document_ref}>{(props) => <Input {...props} maxLength={100} defaultValue={expense?.document_ref} placeholder="Factura, recibo o referencia" />}</FormField>
          <FormField name="document_url" label="Enlace al comprobante (opcional)" error={fields.document_url}>{(props) => <Input {...props} type="url" maxLength={2000} defaultValue={expense?.document_url} placeholder="https://…" />}</FormField>
          <section aria-label="Detalle del documento" className="space-y-3">
            <div><h3 className="text-sm font-semibold">Detalle de gastos</h3><p className="text-xs text-muted-foreground">Montos finales en USD, incluido IVA si aplica.</p></div>
            <div className="overflow-x-auto border">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-surface-strong"><tr className="border-b text-left"><th className="px-3 py-2 font-medium">Concepto</th><th className="w-40 px-3 py-2 font-medium">Categoría</th><th className="w-28 px-3 py-2 text-right font-medium">Monto</th><th className="w-12"><span className="sr-only">Quitar</span></th></tr></thead>
                <tbody>{lines.map((line, index) => <tr key={line.key} className="border-b align-top last:border-b-0">
                  <td className="p-2"><FormField name={`lines.${index}.concept`} label={<span className="sr-only">Concepto línea {index + 1}</span>} error={fields[`lines.${index}.concept`]}>{(props) => <Input {...props} required maxLength={200} value={line.concept} onChange={(event) => changeLine(line.key, { concept: event.target.value })} placeholder="Ej. Alimentación" />}</FormField></td>
                  <td className="p-2"><FormField name={`lines.${index}.category`} label={<span className="sr-only">Categoría línea {index + 1}</span>} error={fields[`lines.${index}.category`]}>{(props) => <NativeSelect {...props} className="w-full" value={line.category} onChange={(event) => changeLine(line.key, { category: event.target.value as ExpenseCategory })}>{Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}</FormField></td>
                  <td className="p-2"><FormField name={`lines.${index}.amount`} label={<span className="sr-only">Monto línea {index + 1}</span>} error={fields[`lines.${index}.amount`]}>{(props) => <Input {...props} inputMode="decimal" className="text-right" required value={line.amount} onChange={(event) => changeLine(line.key, { amount: event.target.value })} placeholder="0,00" />}</FormField></td>
                  <td className="p-2"><Button type="button" variant="ghost" size="icon" aria-label={`Quitar línea ${index + 1}`} disabled={lines.length === 1} onClick={() => { setLines((current) => current.filter((row) => row.key !== line.key)); clearLineErrors(); }}><HugeiconsIcon icon={Delete02Icon} className="size-4" /></Button></td>
                </tr>)}</tbody>
              </table>
            </div>
            {fields.lines && <p role="alert" className="text-sm text-destructive">{fields.lines}</p>}
            <Button type="button" variant="outline" size="sm" disabled={lines.length >= MAX_EXPENSE_LINES} onClick={() => { const key = nextKey.current++; setLines((current) => [...current, { key, concept: "", category: "other", amount: "" }]); clearLineErrors(); }}><HugeiconsIcon icon={Add01Icon} className="size-4" />Añadir línea</Button>
          </section>
          <FormField name="notes" label="Observaciones (opcional)" error={fields.notes}>{(props) => <Textarea {...props} maxLength={2000} rows={3} defaultValue={expense?.notes} />}</FormField>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </fieldset>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-4">
          <div><p className="text-xs text-muted-foreground">{lines.length} {lines.length === 1 ? "línea" : "líneas"} · Total del documento</p><output aria-label="Total del documento" aria-live="polite" className="num text-lg font-semibold">{total === null ? "—" : formatCents(total)}</output></div>
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar documento"}</Button></div>
        </div>
      </form>
    </>
  );
}
