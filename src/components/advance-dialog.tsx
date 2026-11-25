"use client";

import { startTransition, useState } from "react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { HeaderAction } from "@/components/header-action";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-page";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CELL_ROW } from "@/components/cell-header";
import { cn } from "@/lib/utils";
import { todayEcuador } from "@/lib/dates";
import { addSupplierAdvance, deleteSupplierAdvance, type PaymentResult } from "@/lib/payment-actions";
import { PAY_METHODS, type BankOption } from "@/lib/payments";

// Registrar un anticipo al proveedor (sin factura): después se aplica a una o varias facturas desde cada una.
export function AdvanceDialog({
  org, contractId, suppliers, banks,
}: {
  org: string; contractId: string; suppliers: { id: string; name: string }[]; banks: BankOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderAction icon={Add01Icon} label="Registrar anticipo" onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          {/* Encabezado solo con el título (una línea, como los demás cajones); la explicación va en el cuerpo. */}
          <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
            <SheetTitle className="caps-md min-w-0 truncate font-medium">Registrar anticipo</SheetTitle>
            <SheetClose render={<Button type="button" variant="ghost" size="icon" aria-label="Cerrar" />}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </SheetClose>
          </SheetHeader>
          {open && <AdvanceForm org={org} contractId={contractId} suppliers={suppliers} banks={banks} onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AdvanceForm({
  org, contractId, suppliers, banks, onDone,
}: {
  org: string; contractId: string; suppliers: { id: string; name: string }[]; banks: BankOption[]; onDone: () => void;
}) {
  const [date, setDate] = useState(todayEcuador());
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<PaymentResult>();
  const [saving, setSaving] = useState(false);
  const errors = state?.fields ?? {};
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col [&_input]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        if (saving) return;
        const data = new FormData(e.currentTarget);
        setSaving(true);
        startTransition(async () => {
          const r = await addSupplierAdvance(org, contractId, data);
          setSaving(false);
          setState(r);
          if (r.ok) { toast.success("Anticipo registrado."); onDone(); }
        });
      }}
    >
      {/* Los campos se desplazan; el error y los botones se quedan fijos (el error no puede quedar fuera de vista). */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <SheetDescription className="text-sm text-muted-foreground">
        Dinero entregado a un proveedor antes de tener la factura. Se aplica después a una o varias facturas suyas.
      </SheetDescription>
      <FormField name="supplier_id" label="Proveedor" error={errors.supplier_id}>
        {(a11y) => (
          <NativeSelect {...a11y} className="w-full" defaultValue="">
            <option value="" disabled>Selecciona…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        )}
      </FormField>
      <FormField name="paid_on" label="Fecha" error={errors.paid_on}>
        {(a11y) => <DatePicker {...a11y} name="paid_on" value={date} onChange={setDate} />}
      </FormField>
      <FormField name="amount" label="Monto (USD)" error={errors.amount}>
        {(a11y) => <MoneyInput {...a11y} name="amount" value={amount} onChange={setAmount} />}
      </FormField>
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
      <FormField name="reference" label="N.º de comprobante (opcional)">
        {(a11y) => <Input {...a11y} maxLength={100} className="font-mono" />}
      </FormField>
      <FormField name="notes" label="Notas (opcional)">
        {(a11y) => <Input {...a11y} maxLength={500} />}
      </FormField>
      </div>
      <FormError error={state?.error} />
      {/* Pie del cajón: misma altura que el pie de la pantalla; Cancelar y Guardar a la derecha. */}
      <div className="flex h-(--footer-height) shrink-0 items-center justify-end gap-2 border-t bg-background px-6">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="brand" disabled={saving}>{saving ? "Guardando…" : "Guardar anticipo"}</Button>
      </div>
    </form>
  );
}

// Quitar un anticipo de la lista (solo si todavía no se aplicó a una factura).
export function DeleteAdvance({ org, contractId, id }: { org: string; contractId: string; id: string }) {
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
          const r = await deleteSupplierAdvance(org, contractId, id);
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
