"use client";

import { startTransition, useActionState, useEffect, useId, useRef } from "react";
import { FormField } from "@/components/form-field";
import { FormError, FormPageActions } from "@/components/form-page";
import { HeaderTitle } from "@/components/header-action";
import { NumericInput } from "@/components/numeric-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageFooterActions } from "@/components/page-shortcuts";
import { CellGrid, PageSection } from "@/components/page-section";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { deleteParty, saveParty } from "@/lib/party-actions";
import { PARTIES, CLIENT_TYPES, partyListHref, type ClientType, type Party, type PartyKind } from "@/lib/parties";

// Los campos de un cliente, proveedor o responsable.
function PartyFields({
  kind,
  party,
  defaultClientType,
  errors,
}: {
  kind: PartyKind;
  party?: Party;
  defaultClientType?: ClientType;
  errors: Record<string, string>;
}) {
  return (
    <>
      {kind === "clients" && (
        <FormField name="client_type" label="Tipo de cliente" error={errors.client_type}>
          {(props) => (
            <NativeSelect {...props} className="w-full" required defaultValue={party?.client_type ?? defaultClientType ?? ""}>
              <option value="" disabled>
                Selecciona…
              </option>
              {Object.entries(CLIENT_TYPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      )}
      <FormField name="name" label="Nombre" error={errors.name}>
        {(a11y) => <Input {...a11y} required autoFocus defaultValue={party?.name} />}
      </FormField>
      <FormField name="ruc" label="RUC o cédula (opcional)" error={errors.ruc} hint="13 dígitos para un RUC, 10 para una cédula">
        {(a11y) => <NumericInput {...a11y} maxLength={13} className="font-mono" defaultValue={party?.ruc ?? ""} />}
      </FormField>
      {/* Con tres campos (sin tipo de cliente), la dirección ocupa la fila entera para no dejar una celda vacía. */}
      <FormField name="address" label="Dirección (opcional)" error={errors.address} className={kind === "clients" ? undefined : "md:col-span-2"}>
        {(a11y) => <Input {...a11y} defaultValue={party?.address ?? ""} />}
      </FormField>
    </>
  );
}

export function PartyForm({
  kind,
  org,
  party,
  canDelete,
  defaultClientType,
}: {
  kind: PartyKind;
  org: string;
  party?: Party;
  canDelete?: boolean;
  defaultClientType?: ClientType;
}) {
  const cfg = PARTIES[kind];
  const [state, action, pending] = useActionState(
    saveParty.bind(null, kind, org, party?.id ?? null),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const errors = state?.fields ?? {};
  const cancelHref = partyListHref(org, kind, party?.client_type ?? defaultClientType);

  // Foco al primer campo con error.
  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return; // un segundo Enter no debe enviar de nuevo
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  // Mismo estilo que el formulario de items: título y acciones en el encabezado, sección en celdas.
  return (
    <form id={formId} ref={formRef} noValidate onSubmit={submit}>
      <HeaderTitle>{party ? `Editar ${cfg.singular}` : cfg.newLabel}</HeaderTitle>
      <FormPageActions formId={formId} cancelHref={cancelHref} pending={pending} />
      <FormError error={state?.error} />

      <PageSection index="01" label={`Datos del ${cfg.singular}`} className="p-0">
        <CellGrid className="border-0 md:grid-cols-2">
          <PartyFields kind={kind} party={party} defaultClientType={defaultClientType} errors={errors} />
        </CellGrid>
      </PageSection>

      {party && canDelete && (
        <PageFooterActions>
          <ConfirmDelete label={`Eliminar ${cfg.singular}`} onConfirm={() => deleteParty(kind, org, party.id)} />
        </PageFooterActions>
      )}
    </form>
  );
}
