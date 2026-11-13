"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteBank, saveBank } from "@/lib/bank-actions";
import { ACCOUNT_TYPES, type BankAccount } from "@/lib/banks";
import { centsToInput } from "@/lib/money";

// Crear o editar una cuenta bancaria: banco, tipo, número, monto inicial y el responsable de contrato asociado.
export function BankForm({
  org,
  account,
  managers,
  canDelete,
}: {
  org: string;
  account?: BankAccount;
  managers: { id: string; name: string }[];
  canDelete?: boolean;
}) {
  const [state, action, pending] = useActionState(saveBank.bind(null, org, account?.id ?? null), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [initial, setInitial] = useState(account ? centsToInput(account.initial_cents) : "");
  const errors = state?.fields ?? {};

  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      noValidate
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <FieldSet>
        <FieldLegend>Datos de la cuenta</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <FormField name="bank" label="Banco" error={errors.bank}>
            {(a11y) => <Input {...a11y} required autoFocus maxLength={100} defaultValue={account?.bank} />}
          </FormField>
          <FormField name="account_type" label="Tipo de cuenta" error={errors.account_type}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" required defaultValue={account?.account_type ?? ""}>
                <option value="" disabled>Selecciona…</option>
                {Object.entries(ACCOUNT_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="account_number" label="Número de cuenta" error={errors.account_number}>
            {(a11y) => <Input {...a11y} required maxLength={30} inputMode="numeric" className="font-mono" defaultValue={account?.account_number} />}
          </FormField>
          <FormField name="initial" label="Monto inicial (USD)" error={errors.initial} hint="Saldo con el que se abre la cuenta en el sistema">
            {(a11y) => <MoneyInput {...a11y} name="initial" value={initial} onChange={setInitial} />}
          </FormField>
          <FormField name="manager_id" label="Responsable de contrato (opcional)" error={errors.manager_id} className="md:col-span-2">
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" defaultValue={account?.manager_id ?? ""}>
                <option value="">Sin responsable</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </FieldGroup>
      </FieldSet>

      <FieldSeparator />

      {state?.error && <FieldError>{state.error}</FieldError>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? "Guardando…" : account ? "Guardar cambios" : "Crear cuenta"}
        </Button>
        <Link href={`/${org}/bancos`} className={buttonVariants({ variant: "outline" })}>Cancelar</Link>
        {account && canDelete && <ConfirmDelete onConfirm={() => deleteBank(org, account.id)} />}
      </div>
    </form>
  );
}
