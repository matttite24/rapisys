"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { CellGrid, PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteAsset, saveAsset, type AssetState } from "@/lib/asset-actions";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";

export type AssetData = {
  id: string;
  kind: AssetKind;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
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
              <Input {...a11y} type="number" inputMode="numeric" className="font-mono" defaultValue={asset?.year ?? ""} />
            )}
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
          {asset && canDelete && <DeleteAsset org={org} id={asset.id} />}
        </div>
      </div>
    </form>
  );
}

function DeleteAsset({ org, id }: { org: string; id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<AssetState>();

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" className="min-h-11 sm:ml-auto sm:min-h-10" onClick={() => setConfirming(true)}>
        Eliminar
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
      <span className="text-sm">Se quitará también de los items compatibles. ¿Eliminar?</span>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        className="min-h-11 sm:min-h-10"
        onClick={async () => {
          setPending(true);
          const res = await deleteAsset(org, id);
          setPending(false);
          setState(res);
          if (res?.error) setConfirming(false);
        }}
      >
        Sí, eliminar
      </Button>
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setConfirming(false)}>
        No
      </Button>
      {state?.error && <FieldError>{state.error}</FieldError>}
    </span>
  );
}
