"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { CellGrid, PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteAsset, saveAsset } from "@/lib/asset-actions";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";

export type AssetData = {
  id: string;
  kind: AssetKind;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  serial: string | null;
  engine: string | null;
  identifier: string | null;
};

export function AssetForm({
  org,
  asset,
  canDelete,
}: {
  org: string;
  asset?: AssetData;
  canDelete?: boolean;
}) {
  const [state, action, pending] = useActionState(saveAsset.bind(null, org, asset?.id ?? null), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state?.fields ?? {};

  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return; // un segundo Enter no debe enviar de nuevo
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <PageSection label="Datos del activo" className="p-0">
        <CellGrid className="border-0 md:grid-cols-3">
          <FormField name="kind" label="Tipo" error={errors.kind}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" required defaultValue={asset?.kind ?? ""}>
                <option value="">Selecciona…</option>
                {(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="name" label="Nombre" error={errors.name}>
            {(a11y) => <Input {...a11y} required autoFocus defaultValue={asset?.name} />}
          </FormField>
          <FormField name="plate" label="Placa o código (opcional)">
            {(a11y) => <Input {...a11y} className="font-mono uppercase" defaultValue={asset?.plate ?? ""} />}
          </FormField>
          <FormField name="brand" label="Marca (opcional)">
            {(a11y) => <Input {...a11y} defaultValue={asset?.brand ?? ""} />}
          </FormField>
          <FormField name="model" label="Modelo (opcional)">
            {(a11y) => <Input {...a11y} defaultValue={asset?.model ?? ""} />}
          </FormField>
          <FormField name="year" label="Año (opcional)" error={errors.year}>
            {(a11y) => (
              <NumericInput {...a11y} maxLength={4} className="font-mono" defaultValue={asset?.year ?? ""} />
            )}
          </FormField>
          <FormField name="serial" label="Serie (opcional)" error={errors.serial}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.serial ?? ""} />}
          </FormField>
          <FormField name="engine" label="Motor (opcional)" error={errors.engine}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.engine ?? ""} />}
          </FormField>
          <FormField name="identifier" label="Identificador (opcional)" error={errors.identifier}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.identifier ?? ""} />}
          </FormField>
        </CellGrid>
      </PageSection>

      <div className="flex flex-col gap-4 p-6">
        {state?.error && <FieldError>{state.error}</FieldError>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} className="min-h-11 sm:min-h-10">
            {pending ? "Guardando…" : asset ? "Guardar cambios" : "Crear activo"}
          </Button>
          <Link
            href={`/${org}/bodega/activos`}
            className={buttonVariants({ variant: "outline" }) + " min-h-11 sm:min-h-10"}
          >
            Cancelar
          </Link>
          {asset && canDelete && (
            <ConfirmDelete
              message="Se quitará también de los items compatibles. ¿Eliminar?"
              onConfirm={() => deleteAsset(org, asset.id)}
            />
          )}
        </div>
      </div>
    </form>
  );
}
