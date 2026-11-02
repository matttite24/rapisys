"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteParty, saveParty, type PartyState } from "@/lib/party-actions";
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
              <Input {...a11y} inputMode="numeric" className="font-mono" defaultValue={party?.ruc ?? ""} />
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
          {party && canDelete && <DeleteParty kind={kind} org={org} id={party.id} />}
        </div>
      </div>
    </form>
  );
}

// Eliminar en dos pasos, sin diálogos del navegador.
function DeleteParty({ kind, org, id }: { kind: PartyKind; org: string; id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<PartyState>();

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" className="min-h-11 sm:ml-auto sm:min-h-10" onClick={() => setConfirming(true)}>
        Eliminar
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
      <span className="text-sm">¿Eliminar definitivamente?</span>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        className="min-h-11 sm:min-h-10"
        onClick={async () => {
          setPending(true);
          const res = await deleteParty(kind, org, id);
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
