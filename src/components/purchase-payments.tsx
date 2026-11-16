"use client";

import { startTransition, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addPurchaseMovement, deletePurchaseMovement, type PaymentResult } from "@/lib/payment-actions";
import { MOVEMENT_LABEL, PAY_METHODS, invoiceBalance, type AdvanceOption, type BankOption, type Movement, type MovementKind } from "@/lib/payments";
import { formatIso, todayEcuador } from "@/lib/dates";
import { centsToInput, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

// Movimientos de una factura de compra: pagos, registro a crédito (con vencimiento) y anticipos aplicados.
export function PurchasePayments({
  org,
  contractId,
  purchaseId,
  totalCents,
  movements,
  advances,
  banks,
  canAct,
}: {
  org: string;
  contractId: string;
  purchaseId: string;
  totalCents: number;
  movements: Movement[];
  advances: AdvanceOption[];
  banks: BankOption[];
  canAct: boolean;
}) {
  const [mode, setMode] = useState<MovementKind | null>(null);
  const bal = invoiceBalance(totalCents, movements);
  const stat = "flex min-w-0 flex-col gap-1";

  return (
    <div className="flex flex-col">
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 [&>div]:bg-background [&>div]:p-4">
        <div className={stat}><dt className="caps text-muted-foreground">Total con IVA</dt><dd className="num font-mono text-lg">{formatCents(bal.total)}</dd></div>
        <div className={stat}><dt className="caps text-muted-foreground">Pagado</dt><dd className="num font-mono text-lg">{formatCents(bal.paid)}</dd></div>
        <div className={stat}><dt className="caps text-muted-foreground">A crédito</dt><dd className="num font-mono text-lg">{formatCents(bal.credit)}</dd></div>
        <div className={stat}>
          <dt className="caps text-muted-foreground">Por registrar</dt>
          <dd className={cn("num font-mono text-lg", bal.pending > 0 && "font-semibold")}>{formatCents(bal.pending)}</dd>
        </div>
      </dl>

      {movements.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Todavía no hay pagos, créditos ni anticipos en esta factura.</p>
      ) : (
        <ul className="divide-y">
          {movements.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {MOVEMENT_LABEL[m.kind]}
                  <span className="num ml-2 font-normal text-muted-foreground">{formatIso(m.moved_on)}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[
                    m.kind === "payment" && m.method ? PAY_METHODS[m.method as keyof typeof PAY_METHODS] ?? m.method : null,
                    m.bank,
                    m.kind === "credit" && m.due_on ? `vence ${formatIso(m.due_on)}` : null,
                    m.kind === "advance" ? m.advance_ref : null,
                    m.reference ? `Ref. ${m.reference}` : null,
                    m.notes || null,
                  ].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num font-mono">{formatCents(m.amount_cents)}</span>
                {canAct && <DeleteMovement org={org} contractId={contractId} id={m.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAct && (
        <div className="flex flex-col gap-4 border-t p-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={mode === "payment" ? "secondary" : "outline"} onClick={() => setMode(mode === "payment" ? null : "payment")}>Registrar pago</Button>
            <Button size="sm" variant={mode === "credit" ? "secondary" : "outline"} onClick={() => setMode(mode === "credit" ? null : "credit")}>Registrar a crédito</Button>
            <Button
              size="sm"
              variant={mode === "advance" ? "secondary" : "outline"}
              disabled={advances.length === 0}
              title={advances.length === 0 ? "No hay anticipos disponibles de este proveedor en el proceso" : undefined}
              onClick={() => setMode(mode === "advance" ? null : "advance")}
            >
              Aplicar anticipo
            </Button>
          </div>
          {mode && (
            <MovementForm
              key={mode}
              org={org}
              contractId={contractId}
              purchaseId={purchaseId}
              kind={mode}
              pendingCents={bal.pending}
              advances={advances}
              banks={banks}
              onDone={() => setMode(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DeleteMovement({ org, contractId, id }: { org: string; contractId: string; id: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant={armed ? "destructive" : "ghost"}
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setBusy(true);
        startTransition(async () => {
          const r = await deletePurchaseMovement(org, contractId, id);
          setBusy(false);
          setArmed(false);
          if (r.error) toast.error(r.error);
        });
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirmar" : "Quitar"}
    </Button>
  );
}

function MovementForm({
  org, contractId, purchaseId, kind, pendingCents, advances, banks, onDone,
}: {
  org: string; contractId: string; purchaseId: string; kind: MovementKind; pendingCents: number;
  advances: AdvanceOption[]; banks: BankOption[]; onDone: () => void;
}) {
  const [date, setDate] = useState(todayEcuador());
  const [due, setDue] = useState("");
  const [advanceId, setAdvanceId] = useState(advances[0]?.id ?? "");
  const advance = advances.find((a) => a.id === advanceId);
  // Por defecto, lo que falta de la factura (o, con un anticipo, lo que alcance).
  const suggested = kind === "advance" ? Math.min(pendingCents, advance?.remainingCents ?? 0) : pendingCents;
  const [amount, setAmount] = useState(suggested > 0 ? centsToInput(suggested) : "");
  const [state, setState] = useState<PaymentResult>();
  const [saving, setSaving] = useState(false);
  const errors = state?.fields ?? {};

  return (
    <form
      noValidate
      className="grid gap-4 border bg-muted/30 p-4 md:grid-cols-3 [&_input]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        if (saving) return;
        const data = new FormData(e.currentTarget);
        data.set("kind", kind);
        setSaving(true);
        startTransition(async () => {
          const r = await addPurchaseMovement(org, contractId, purchaseId, data);
          setSaving(false);
          setState(r);
          if (r.ok) {
            toast.success(`${MOVEMENT_LABEL[kind]} registrado.`);
            onDone();
          }
        });
      }}
    >
      <FormField name="moved_on" label={kind === "credit" ? "Fecha del crédito" : "Fecha"} error={errors.moved_on}>
        {(a11y) => <DatePicker {...a11y} name="moved_on" value={date} onChange={setDate} />}
      </FormField>
      <FormField name="amount" label="Monto (USD, con IVA)" error={errors.amount}>
        {(a11y) => <MoneyInput {...a11y} name="amount" value={amount} onChange={setAmount} />}
      </FormField>
      {kind === "credit" && (
        <FormField name="due_on" label="Vence el" error={errors.due_on}>
          {(a11y) => <DatePicker {...a11y} name="due_on" value={due} onChange={setDue} />}
        </FormField>
      )}
      {kind === "payment" && (
        <>
          <FormField name="method" label="Cómo se pagó" error={errors.method}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" defaultValue="transfer">
                {Object.entries(PAY_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="bank_account_id" label="Cuenta de Bancos (opcional)" error={errors.bank_account_id}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" defaultValue="">
                <option value="">Sin cuenta (efectivo u otra)</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </NativeSelect>
            )}
          </FormField>
        </>
      )}
      {kind === "advance" && (
        <FormField name="advance_id" label="Anticipo" error={errors.advance_id} hint={advance ? `Disponible ${formatCents(advance.remainingCents)}` : undefined}>
          {(a11y) => (
            <NativeSelect {...a11y} className="w-full" value={advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
              {advances.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </NativeSelect>
          )}
        </FormField>
      )}
      <FormField name="reference" label="N.º de comprobante (opcional)">
        {(a11y) => <Input {...a11y} maxLength={100} className="font-mono" />}
      </FormField>
      <FormField name="notes" label="Notas (opcional)" className="md:col-span-2">
        {(a11y) => <Input {...a11y} maxLength={500} />}
      </FormField>
      {state?.error && <div className="md:col-span-3"><FieldError>{state.error}</FieldError></div>}
      <div className="flex gap-2 md:col-span-3">
        <Button type="submit" variant="brand" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  );
}
