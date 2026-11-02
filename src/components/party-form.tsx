"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteParty, saveParty } from "@/lib/party-actions";
import { PARTIES, type Party, type PartyKind } from "@/lib/parties";

export function PartyForm({
  kind,
  org,
  party,
  canDelete,
}: {
  kind: PartyKind;
  org: string;
  party?: Party;
  canDelete?: boolean;
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
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return; // un segundo Enter no debe enviar de nuevo
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <PageSection label="Datos" className="p-0">
        <div className="grid gap-px border-0 bg-border md:grid-cols-3 [&>*]:bg-background [&>*]:p-4">
          <FormField name="name" label="Nombre" error={errors.name}>
            {(a11y) => <Input {...a11y} required autoFocus defaultValue={party?.name} />}
          </FormField>
          <FormField
            name="ruc"
            label="RUC o cédula (opcional)"
            error={errors.ruc}
            hint="13 dígitos para un RUC, 10 para una cédula"
          >
            {(a11y) => (
              <NumericInput {...a11y} maxLength={13} className="font-mono" defaultValue={party?.ruc ?? ""} />
            )}
          </FormField>
          <FormField name="address" label="Dirección (opcional)">
            {(a11y) => <Input {...a11y} defaultValue={party?.address ?? ""} />}
          </FormField>
        </div>
      </PageSection>

      <div className="flex flex-col gap-4 p-6">
        {state?.error && <FieldError>{state.error}</FieldError>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} className="min-h-11 sm:min-h-10">
            {pending ? "Guardando…" : party ? "Guardar cambios" : `Crear ${cfg.singular}`}
          </Button>
          <Link
            href={`/${org}/${cfg.path}`}
            className={buttonVariants({ variant: "outline" }) + " min-h-11 sm:min-h-10"}
          >
            Cancelar
          </Link>
          {party && canDelete && <ConfirmDelete onConfirm={() => deleteParty(kind, org, party.id)} />}
        </div>
      </div>
    </form>
  );
}
