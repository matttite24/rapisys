"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startTransition, useRef, useState } from "react";
import { Add01Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { PageSection } from "@/components/page-section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { adjustLot, addStock, type StockState } from "@/lib/stock-actions";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type LotView = {
  id: string;
  date: string;
  supplier: string;
  costCents: number | null;
  received: number;
  remaining: number;
  kind: "compra" | "ajuste";
  note: string;
};

const KIND_LABEL = { compra: "Compra", ajuste: "Entrada manual" } as const;

// Existencias de un producto: el total, sus lotes (con proveedor y costo) y las entradas/ajustes.
export function StockPanel({
  org,
  itemId,
  lots,
  suppliers,
  canEdit,
}: {
  org: string;
  itemId: string;
  lots: LotView[];
  suppliers: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const total = lots.reduce((s, l) => s + l.remaining, 0);
  const [adjusting, setAdjusting] = useState<LotView | null>(null);

  return (
    <>
      <PageSection
        label="Existencias"
        meta={<span className="num">{lots.filter((l) => l.remaining > 0).length} lotes con unidades</span>}
        className="p-0"
      >
        <div className="flex items-baseline gap-3 border-b px-6 py-4">
          <span className="num text-2xl font-medium">{total}</span>
          <span className="caps-md text-muted-foreground">
            {total === 0 ? "sin existencias" : total === 1 ? "unidad disponible" : "unidades disponibles"}
          </span>
        </div>

        {canEdit && (
          <div className="border-b bg-surface-strong px-6 py-4">
            <EntryForm org={org} itemId={itemId} suppliers={suppliers} />
          </div>
        )}

        {lots.length === 0 ? (
          <p className="p-6 text-muted-foreground">
            Este producto aún no tiene existencias. La ficha se conserva aunque estén en 0.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-transparent">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Costo s/IVA</TableHead>
                  <TableHead className="text-right">Entró</TableHead>
                  <TableHead className="text-right">Queda</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Nota</TableHead>
                  {canEdit && <TableHead className="w-px"><span className="sr-only">Ajustar</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l.id} className={cn("border-b last:border-b-0", l.remaining === 0 && "text-muted-foreground")}>
                    <TableCell className="num whitespace-nowrap">{l.date}</TableCell>
                    <TableCell>{l.supplier || "—"}</TableCell>
                    <TableCell className="num text-right">{l.costCents === null ? "—" : formatCents(l.costCents)}</TableCell>
                    <TableCell className="num text-right">{l.received}</TableCell>
                    <TableCell className="num text-right font-medium">{l.remaining}</TableCell>
                    <TableCell>{KIND_LABEL[l.kind]}</TableCell>
                    <TableCell className="max-w-64 break-words">{l.note || "—"}</TableCell>
                    {canEdit && (
                      <TableCell className={cn("p-1")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          aria-label={`Ajustar el lote del ${l.date}`}
                          onClick={() => setAdjusting(l)}
                        >
                          <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <AdjustDialog org={org} itemId={itemId} lot={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

// Entrada manual: proveedor y costo opcionales (el inventario que ya tienes puede no tenerlos).
function EntryForm({
  org,
  itemId,
  suppliers,
}: {
  org: string;
  itemId: string;
  suppliers: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [cost, setCost] = useState("");
  const [state, setState] = useState<StockState>();
  const [saving, setSaving] = useState(false);
  const errors = state?.fields ?? {};

  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-4 md:grid-cols-[8rem_1fr_11rem_1fr_auto] md:items-start [&_input]:bg-background [&_select]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        if (saving) return;
        const data = new FormData(e.currentTarget);
        setSaving(true);
        setState(undefined);
        startTransition(async () => {
          const res = await addStock(org, itemId, data);
          setSaving(false);
          setState(res);
          if (res?.ok) {
            formRef.current?.reset();
            setCost("");
          }
        });
      }}
    >
      <FormField name="quantity" label="Cantidad" error={errors.quantity}>
        {(a11y) => <NumericInput {...a11y} kind="decimal" className="font-mono" />}
      </FormField>
      <FormField name="supplier_id" label="Proveedor (opcional)">
        {(a11y) => (
          <NativeSelect {...a11y} className="w-full" defaultValue="">
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField name="unit_cost" label="Costo unitario s/IVA (opcional)" error={errors.unit_cost}>
        {(a11y) => <MoneyInput {...a11y} name="unit_cost" value={cost} onChange={setCost} />}
      </FormField>
      <FormField name="note" label="Nota (opcional)" error={errors.note}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={300} placeholder="Inventario inicial, reposición…" />}
      </FormField>
      <div className="flex flex-col gap-2">
        <span aria-hidden className="max-md:hidden font-mono text-2xs leading-4">&nbsp;</span>
        <Button type="submit" disabled={saving} className="h-9 gap-2">
          <HugeiconsIcon icon={Add01Icon} className="size-5" />
          {saving ? "Guardando…" : "Registrar entrada"}
        </Button>
      </div>
      {state?.error && (
        <div className="md:col-span-5">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}

function AdjustDialog({
  org,
  itemId,
  lot,
  onClose,
}: {
  org: string;
  itemId: string;
  lot: LotView | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<StockState>();
  const [saving, setSaving] = useState(false);
  const errors = state?.fields ?? {};

  function close() {
    setState(undefined);
    onClose();
  }

  return (
    <Dialog open={lot !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {lot && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (saving) return;
              const data = new FormData(e.currentTarget);
              setSaving(true);
              setState(undefined);
              startTransition(async () => {
                const res = await adjustLot(org, itemId, lot.id, data);
                setSaving(false);
                if (res?.ok) close();
                else setState(res);
              });
            }}
          >
            <DialogHeader className="border-b p-6 pr-16">
              <DialogTitle>Ajustar lote</DialogTitle>
              <DialogDescription>
                {lot.supplier || "Sin proveedor"} · {lot.date} · quedan <span className="num">{lot.remaining}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 p-6">
              <FormField name="mode" label="Qué hacer">
                {(a11y) => (
                  <NativeSelect {...a11y} className="w-full" defaultValue="remove">
                    <option value="remove">Restar unidades (merma, conteo)</option>
                    <option value="add">Sumar unidades (corrección)</option>
                  </NativeSelect>
                )}
              </FormField>
              <FormField name="quantity" label="Cantidad" error={errors.quantity}>
                {(a11y) => <NumericInput {...a11y} kind="decimal" autoFocus className="font-mono" />}
              </FormField>
              <FormField name="note" label="Motivo (opcional)" error={errors.note}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={300} />}
              </FormField>
              {state?.error && <FieldError>{state.error}</FieldError>}
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button type="submit" disabled={saving} className="h-9">
                {saving ? "Guardando…" : "Aplicar ajuste"}
              </Button>
              <Button type="button" variant="outline" className="h-9" disabled={saving} onClick={close}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
