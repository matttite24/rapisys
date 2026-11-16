"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addLine, updateLine, type LineState } from "@/lib/contract-actions";
import { centsToInput, parseCents, parseDecimal } from "@/lib/money";
import { UNITS, isUnit } from "@/lib/units";
import { LineView, TEMP_PREFIX } from "@/components/contract-lines-model";

export const MESSAGES = {
  description: "Escribe la descripción del item.",
  quantity: "Escribe una cantidad mayor a 0, con máximo 2 decimales.",
  unit: "Elige una unidad de medida.",
};

// Agrega o edita una línea de la lista: número de parte, descripción, cantidad, unidad y CPC.
export function LineForm({
  org,
  contractId,
  listId,
  editing,
  onAdd,
  onAdded,
  onUpdate,
  onDone,
}: {
  org: string;
  contractId: string;
  listId: string;
  editing: LineView | null;
  onAdd: (line: LineView) => void;
  onAdded: () => void;
  onUpdate: (line: LineView) => void;
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<LineState>();
  const [saving, setSaving] = useState(false);

  // Al pasar a editar una línea, el formulario se ve y toma el foco.
  useEffect(() => {
    if (!editing) return;
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="description"]')?.focus();
  }, [editing]);
  const errors = state?.fields ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const partNumber = String(data.get("part_number") ?? "").trim();
    const internalCode = String(data.get("internal_code") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const quantity = parseDecimal(String(data.get("quantity") ?? ""));
    const unit = String(data.get("unit") ?? "");
    const priceText = String(data.get("reference_price") ?? "").trim();

    // Se valida aquí para responder al instante; el servidor vuelve a validar.
    const fields: Record<string, string> = {};
    if (!description) fields.description = MESSAGES.description;
    if (quantity === null || quantity <= 0) fields.quantity = MESSAGES.quantity;
    if (!isUnit(unit)) fields.unit = MESSAGES.unit;
    let referencePriceCents: number | null = null;
    if (priceText) {
      const price = parseCents(priceText);
      if (!price.ok) fields.reference_price = price.error;
      else referencePriceCents = price.cents;
    }
    if (Object.keys(fields).length || quantity === null) {
      setState({ fields });
      return;
    }

    setState(undefined);
    const line = { listId, n: editing?.n ?? 0, partNumber, internalCode, description, quantity, unit, referencePriceCents };

    if (editing) {
      // La fila cambia ya; el formulario sale de edición cuando el servidor confirma.
      setSaving(true);
      startTransition(async () => {
        onUpdate({ ...line, id: editing.id });
        const res = await updateLine(org, contractId, editing.id, data);
        setSaving(false);
        if (res?.error || res?.fields) setState(res);
        else onDone();
      });
      return;
    }

    startTransition(async () => {
      // La fila aparece ya y el formulario queda listo para la siguiente.
      onAdd({ ...line, id: `${TEMP_PREFIX}${Date.now()}` });
      form.reset();
      form.querySelector<HTMLElement>('[name="part_number"]')?.focus();

      const res = await addLine(org, contractId, listId, data);
      if (res?.error || res?.fields) {
        // No se guardó: se devuelve lo escrito para no perderlo.
        for (const name of ["part_number", "internal_code", "description", "quantity", "unit", "reference_price"]) {
          const el = form.elements.namedItem(name);
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.value = String(data.get(name) ?? "");
          }
        }
        setState(res);
      } else {
        onAdded();
      }
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      // Enter en cualquier campo agrega la línea.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      className="grid gap-4 md:grid-cols-[9rem_8rem_1fr_6.5rem_9rem_9rem_auto] md:items-start [&_input]:bg-background [&_select]:bg-background"
    >
      <FormField name="part_number" label="Part. num." error={errors.part_number}>
        {(a11y) => (
          <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" defaultValue={editing?.partNumber} />
        )}
      </FormField>
      <FormField name="internal_code" label="Cód. interno" error={errors.internal_code}>
        {(a11y) => (
          <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" defaultValue={editing?.internalCode} />
        )}
      </FormField>
      <FormField name="description" label="Descripción" error={errors.description}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} defaultValue={editing?.description} />}
      </FormField>
      <FormField name="quantity" label="Cantidad" error={errors.quantity}>
        {(a11y) => (
          <NumericInput
            {...a11y}
            kind="decimal"
            className="font-mono"
            defaultValue={editing ? String(editing.quantity) : "1"}
          />
        )}
      </FormField>
      <FormField name="unit" label="Unidad" error={errors.unit}>
        {(a11y) => (
          <NativeSelect {...a11y} className="w-full" defaultValue={editing?.unit ?? "unit"}>
            {Object.entries(UNITS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField name="reference_price" label="Precio ref. (total)" error={errors.reference_price}>
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="off"
            inputMode="decimal"
            maxLength={16}
            className="text-right font-mono"
            placeholder="0,00"
            defaultValue={editing?.referencePriceCents != null ? centsToInput(editing.referencePriceCents) : ""}
          />
        )}
      </FormField>
      {/* Etiqueta vacía del mismo alto que las demás: el botón queda a la altura de los campos. */}
      <Field>
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <Button
          type="submit"
          size="icon"
          disabled={saving}
          className="h-10 gap-2 rounded-full px-5"
          aria-label={editing ? "Guardar cambios" : "Agregar línea"}
          title={editing ? "Guardar cambios" : "Agregar línea"}
        >
          <HugeiconsIcon icon={editing ? Tick02Icon : Add01Icon} className="size-5" strokeWidth={2} />
          {editing ? "Guardar" : "Añadir"}
        </Button>
      </Field>
      {state?.error && (
        <div className="md:col-span-7">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
