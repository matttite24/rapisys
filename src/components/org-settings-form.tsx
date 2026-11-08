"use client";

import { startTransition, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateOrganization, type OrgSettingsState } from "@/lib/org-settings-actions";

export type OrgSettingsValues = {
  name: string;
  ruc: string;
  address: string;
  phone: string;
  vatRate: string;
  invitationDays: number;
};

const FORM_ID = "org-settings-form";

// Ajustes de la organización en tres bloques. Solo los administradores editan; los operadores ven los valores.
export function OrgSettingsForm({ org, values, canEdit }: { org: string; values: OrgSettingsValues; canEdit: boolean }) {
  const [state, action, pending] = useActionState<OrgSettingsState, FormData>(updateOrganization.bind(null, org), undefined);
  const errors = state?.fields ?? {};

  // Al guardar, aviso con un toast (los errores se muestran junto al formulario).
  useEffect(() => {
    if (state?.saved) toast.success("Cambios guardados.");
  }, [state]);
  const disabled = !canEdit;

  return (
    <>
    <form
      id={FORM_ID}
      noValidate
      className="flex w-full max-w-3xl flex-col gap-10 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || disabled) return;
        startTransition(() => action(new FormData(e.currentTarget)));
      }}
    >
      <FieldSet>
        <FieldLegend>Organización</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <FormField name="name" label="Nombre" error={errors.name}>
            {(a11y) => <Input {...a11y} required maxLength={120} defaultValue={values.name} disabled={disabled} />}
          </FormField>
          <FormField name="ruc" label="RUC (opcional)" error={errors.ruc} hint="13 dígitos. Sale en los documentos.">
            {(a11y) => <NumericInput {...a11y} maxLength={13} className="font-mono" defaultValue={values.ruc} disabled={disabled} />}
          </FormField>
          <FormField name="address" label="Dirección (opcional)" error={errors.address}>
            {(a11y) => <Input {...a11y} maxLength={200} defaultValue={values.address} disabled={disabled} />}
          </FormField>
          <FormField name="phone" label="Teléfono (opcional)" error={errors.phone}>
            {(a11y) => <Input {...a11y} maxLength={30} inputMode="tel" defaultValue={values.phone} disabled={disabled} />}
          </FormField>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Facturación</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <FormField
            name="vat_rate"
            label="IVA por defecto (%)"
            error={errors.vat_rate}
            hint="Se aplica a los contratos nuevos. Cada contrato guarda el suyo."
          >
            {(a11y) => <Input {...a11y} inputMode="decimal" className="font-mono" defaultValue={values.vatRate} disabled={disabled} />}
          </FormField>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Miembros</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <FormField name="invitation_days" label="Vigencia de las invitaciones (días)" error={errors.invitation_days}>
            {(a11y) => <Input {...a11y} inputMode="numeric" maxLength={2} className="font-mono" defaultValue={values.invitationDays} disabled={disabled} />}
          </FormField>
        </FieldGroup>
        <FieldDescription>Un enlace de invitación deja de servir después de estos días.</FieldDescription>
      </FieldSet>

      {state?.error && <FieldError>{state.error}</FieldError>}
    </form>
    {/* Guardar va en el encabezado de la sección y envía este formulario. */}
    {canEdit && (
      <HeaderAction
        icon={FloppyDiskIcon}
        label={pending ? "Guardando…" : "Guardar"}
        disabled={pending}
        onClick={() => (document.getElementById(FORM_ID) as HTMLFormElement | null)?.requestSubmit()}
      />
    )}
    </>
  );
}
