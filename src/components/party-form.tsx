"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { deleteParty, saveParty } from "@/lib/party-actions";
import { cn } from "@/lib/utils";
import { PARTIES, CLIENT_TYPES, partyListHref, type ClientType, type Party, type PartyKind } from "@/lib/parties";

export function PartyForm({
  kind,
  org,
  party,
  canDelete,
  defaultClientType,
  onCancel,
}: {
  kind: PartyKind;
  org: string;
  party?: Party;
  canDelete?: boolean;
  defaultClientType?: ClientType;
  // Dentro de un modal: "Cancelar" cierra en lugar de navegar.
  onCancel?: () => void;
}) {
  const cfg = PARTIES[kind];
  const [state, action, pending] = useActionState(
    saveParty.bind(null, kind, org, party?.id ?? null),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state?.fields ?? {};

  // Foco al primer campo con error.
  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      noValidate
      className={cn("flex w-full flex-col gap-8", onCancel ? "p-6" : "mx-auto max-w-2xl p-6")}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return; // un segundo Enter no debe enviar de nuevo
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <FieldSet>
        <FieldLegend>Datos {kind === "clients" ? "del cliente" : "del responsable"}</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
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
          <FormField name="address" label="Dirección (opcional)" error={errors.address}>
            {(a11y) => <Input {...a11y} defaultValue={party?.address ?? ""} />}
          </FormField>
        </FieldGroup>
      </FieldSet>

      <FieldSeparator />

      {state?.error && <FieldError>{state.error}</FieldError>}
      <div className="flex flex-wrap items-center gap-2">
        {/* Acción principal de la pantalla: amarillo. */}
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? "Guardando…" : party ? "Guardar cambios" : `Crear ${cfg.singular}`}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : (
          <Link
            href={partyListHref(org, kind, party?.client_type ?? defaultClientType)}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancelar
          </Link>
        )}
        {party && canDelete && <ConfirmDelete onConfirm={() => deleteParty(kind, org, party.id)} />}
      </div>
    </form>
  );
}
