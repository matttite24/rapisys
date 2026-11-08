"use client";

import { useEffect, useRef } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { updateList } from "@/lib/contract-list-actions";
import { ASSET_KIND_LABEL } from "@/lib/items";
import { ListView } from "@/components/contract-lists-model";
import { useListSubmit } from "@/components/use-list-submit";

// Corrige una lista ya creada. Si es de un activo, edita los datos del activo (son suyos);
// una lista general solo tiene nombre.
export function ListDetailsForm({
  org,
  contractId,
  list,
  onDone,
  onCancel,
}: {
  org: string;
  contractId: string;
  list: ListView;
  onDone: (id?: string) => void;
  onCancel?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, saving, submit } = useListSubmit(onDone);
  const errors = state?.fields ?? {};
  const isAsset = Boolean(list.assetId);

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, []);

  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-x-4 gap-y-5 md:grid-cols-4 md:items-start [&_input]:bg-background [&_select]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (!String(data.get("name") ?? "").trim()) {
          return submit(async () => ({ fields: { name: "Escribe el nombre del activo o de la lista." } }));
        }
        submit(() => updateList(org, contractId, list.id, data));
      }}
    >
      <div className={isAsset ? "md:col-span-2" : "md:col-span-4"}>
        <FormField name="name" label={isAsset ? "Nombre del activo" : "Nombre de la lista"} error={errors.name}>
          {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} defaultValue={list.name} />}
        </FormField>
      </div>
      {isAsset && (
        <>
          <FormField name="kind" label="Tipo" error={errors.kind}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" defaultValue={list.kind}>
                <option value="">Selecciona…</option>
                {Object.entries(ASSET_KIND_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="brand" label="Marca" error={errors.brand}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} defaultValue={list.brand} />}
          </FormField>
          <FormField name="model" label="Modelo" error={errors.model}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} defaultValue={list.model} />}
          </FormField>
          <FormField name="serial" label="Serie" error={errors.serial}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.serial} />}
          </FormField>
          <FormField name="engine" label="Serie del motor" error={errors.engine}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.engine} />}
          </FormField>
          <FormField name="year" label="Año de fabricación" error={errors.year}>
            {(a11y) => <Input {...a11y} autoComplete="off" inputMode="numeric" maxLength={4} className="font-mono" defaultValue={list.year} />}
          </FormField>
          <FormField name="identifier" label="N.º de identificación" error={errors.identifier}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.identifier} />}
          </FormField>
          <FormField name="other" label="Otro" error={errors.other}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} defaultValue={list.other} />}
          </FormField>
        </>
      )}
      <Field className="md:col-span-4">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="h-10 gap-2">
            <HugeiconsIcon icon={Tick02Icon} className="size-5" strokeWidth={2} />
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </Field>
      {state?.error && (
        <div className="md:col-span-4">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
