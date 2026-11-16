"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { SupplyLine } from "@/components/supply-board";
import { updateLine, type LineState } from "@/lib/contract-actions";
import { centsToInput } from "@/lib/money";
import { UNITS } from "@/lib/units";

// Datos de la línea abierta en el panel: ocultos hasta tocar «Editar» (n.º de parte, descripción, cantidad, unidad y precio).
export function LineEditor({ org, contractId, line }: { org: string; contractId: string; line: SupplyLine }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<LineState>();
  const [saving, startSave] = useTransition();
  const errors = state?.fields ?? {};

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">Datos de la línea</span>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
          <HugeiconsIcon icon={Edit02Icon} className="size-4" />
          Editar
        </Button>
      </div>
    );
  }

  function close() {
    setState(undefined);
    setEditing(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    startSave(async () => {
      const res = await updateLine(org, contractId, line.id, data);
      if (res?.error || res?.fields) return setState(res);
      toast.success("Línea actualizada.");
      close();
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 border-b px-4 py-3 [&_input]:bg-background [&_select]:bg-background">
      <FormField name="part_number" label="N.º de parte" error={errors.part_number}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" defaultValue={line.partNumber} autoFocus />}
      </FormField>
      <FormField name="internal_code" label="Código interno" error={errors.internal_code}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" defaultValue={line.internalCode} />}
      </FormField>
      <FormField name="description" label="Descripción" error={errors.description}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} defaultValue={line.description} />}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField name="quantity" label="Cantidad" error={errors.quantity}>
          {(a11y) => <NumericInput {...a11y} kind="decimal" className="font-mono" defaultValue={String(line.quantity)} />}
        </FormField>
        <FormField name="unit" label="Unidad" error={errors.unit}>
          {(a11y) => (
            <NativeSelect {...a11y} className="w-full" defaultValue={line.unit}>
              {Object.entries(UNITS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField name="reference_price" label="Precio ref. (total, sin IVA)" error={errors.reference_price}>
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="off"
            inputMode="decimal"
            maxLength={16}
            className="text-right font-mono"
            placeholder="0,00"
            defaultValue={line.referenceCents !== null ? centsToInput(line.referenceCents) : ""}
          />
        )}
      </FormField>
      {state?.error && <FieldError>{state.error}</FieldError>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={close} disabled={saving}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={saving}>Guardar</Button>
      </div>
    </form>
  );
}
