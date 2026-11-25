"use client";

import { startTransition, useActionState, useEffect, useId, useRef } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormError, FormPageActions } from "@/components/form-page";
import { FormField } from "@/components/form-field";
import { HeaderTitle } from "@/components/header-action";
import { NumericInput } from "@/components/numeric-input";
import { PageFooterActions } from "@/components/page-shortcuts";
import { CellGrid, PageSection } from "@/components/page-section";
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
  other: string | null;
};

// Mismo estilo que el formulario de items: título y acciones en el encabezado, secciones numeradas en celdas.
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
  const formId = useId();
  const errors = state?.fields ?? {};

  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form
      id={formId}
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return; // un segundo Enter no debe enviar de nuevo
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <HeaderTitle>{asset ? "Editar activo" : "Nuevo activo"}</HeaderTitle>
      <FormPageActions formId={formId} cancelHref={`/${org}/bodega/activos`} pending={pending} />
      <FormError error={state?.error} />

      <PageSection index="01" label="Identificación" className="p-0">
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
        </CellGrid>
      </PageSection>

      <PageSection index="02" label="Datos técnicos" className="p-0">
        <CellGrid className="border-0 md:grid-cols-3">
          <FormField name="brand" label="Marca (opcional)">
            {(a11y) => <Input {...a11y} defaultValue={asset?.brand ?? ""} />}
          </FormField>
          <FormField name="model" label="Modelo (opcional)">
            {(a11y) => <Input {...a11y} defaultValue={asset?.model ?? ""} />}
          </FormField>
          <FormField name="year" label="Año de fabricación (opcional)" error={errors.year}>
            {(a11y) => (
              <NumericInput {...a11y} maxLength={4} className="font-mono" defaultValue={asset?.year ?? ""} />
            )}
          </FormField>
          <FormField name="serial" label="Serie (opcional)" error={errors.serial}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.serial ?? ""} />}
          </FormField>
          <FormField name="engine" label="Serie del motor (opcional)" error={errors.engine}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.engine ?? ""} />}
          </FormField>
          <FormField name="identifier" label="N.º de identificación (opcional)" error={errors.identifier}>
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={asset?.identifier ?? ""} />}
          </FormField>
          <FormField name="other" label="Otro (opcional)" error={errors.other} className="md:col-span-3">
            {(a11y) => <Input {...a11y} maxLength={200} defaultValue={asset?.other ?? ""} />}
          </FormField>
        </CellGrid>
      </PageSection>

      {asset && canDelete && (
        <PageFooterActions>
          <ConfirmDelete
            label="Eliminar activo"
            message="Se quitará también de los items compatibles. ¿Eliminar?"
            onConfirm={() => deleteAsset(org, asset.id)}
          />
        </PageFooterActions>
      )}
    </form>
  );
}
