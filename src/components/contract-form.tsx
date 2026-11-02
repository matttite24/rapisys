"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createContract } from "@/app/[org]/contratos/nuevo/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CellGrid, PageSection } from "@/components/page-section";
import { NativeSelect } from "@/components/ui/native-select";
import { VAT_RATE } from "@/lib/contracts";
import { addDaysIso, formatIso } from "@/lib/dates";
import { formatCents, parseCents, splitVat } from "@/lib/money";

type Option = { id: string; name: string };
type Errors = Record<string, string>;
const NEW = "__new__";

// Selector de un registro existente, o alta rápida con nombre, RUC y dirección.
function PartyPicker({
  prefix,
  label,
  options,
  errors,
}: {
  prefix: "client" | "manager";
  label: string;
  options: Option[];
  errors: Errors;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <FormField name={`${prefix}_id`} label={label} error={errors[`${prefix}_id`]}>
        {(a11y) => (
          <NativeSelect
            {...a11y}
            className="w-full"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={NEW}>+ Crear nuevo…</option>
          </NativeSelect>
        )}
      </FormField>

      {value === NEW && (
        <div className="flex flex-col gap-4 border bg-muted/50 p-4">
          <FormField name={`${prefix}_name`} label="Nombre" error={errors[`${prefix}_name`]}>
            {(a11y) => <Input {...a11y} required />}
          </FormField>
          <FormField name={`${prefix}_ruc`} label="RUC (opcional)" hint="13 dígitos">
            {(a11y) => <Input {...a11y} inputMode="numeric" className="font-mono" />}
          </FormField>
          <FormField name={`${prefix}_address`} label="Dirección (opcional)">
            {(a11y) => <Input {...a11y} />}
          </FormField>
        </div>
      )}
    </div>
  );
}

export function ContractForm({
  org,
  clients,
  managers,
}: {
  org: string;
  clients: Option[];
  managers: Option[];
}) {
  const [state, formAction, pending] = useActionState(createContract, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [total, setTotal] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState("");

  const errors: Errors = state?.fields ?? {};
  const parsed = parseCents(total);
  const breakdown = parsed.ok ? splitVat(parsed.cents, VAT_RATE) : null;
  const termDays = Number(days);
  // El plazo debe ser un entero mayor a 0; vacío o inválido no genera fecha.
  const end = days.trim() && Number.isInteger(termDays) && termDays > 0 ? addDaysIso(start, termDays) : null;

  // Lleva el foco al primer campo con error para que no pase desapercibido.
  useEffect(() => {
    if (!state) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [state]);

  // Se envía con la acción directamente, sin `<form action>`: así React no
  // reinicia los campos al terminar y lo escrito se conserva si hay un error.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // un segundo Enter no debe enviar de nuevo
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="org" value={org} />

      <PageSection index="01" label="Identificación" className="p-0">
        <CellGrid className="border-0 border-t-0 md:grid-cols-2">
          <FormField name="name" label="Nombre del contrato" error={errors.name}>
            {(a11y) => <Input {...a11y} required autoFocus />}
          </FormField>
          <FormField name="code" label="Código del contrato" error={errors.code}>
            {(a11y) => <Input {...a11y} required className="font-mono" />}
          </FormField>
        </CellGrid>
      </PageSection>

      <PageSection index="02" label="Partes" className="p-0">
        <CellGrid className="border-0 md:grid-cols-2">
          <PartyPicker prefix="client" label="Cliente (institución)" options={clients} errors={errors} />
          <PartyPicker prefix="manager" label="Responsable de contrato" options={managers} errors={errors} />
        </CellGrid>
      </PageSection>

      <PageSection index="03" label="Condiciones" className="p-0">
        <CellGrid className="border-0 md:grid-cols-4">
          <FormField
            name="total"
            label="Monto total en USD (incluye IVA)"
            error={errors.total}
            hint={
              breakdown
                ? `Subtotal ${formatCents(breakdown.subtotal)} · IVA ${VAT_RATE}% ${formatCents(breakdown.vat)}`
                : `Se desglosa el IVA ${VAT_RATE}% automáticamente`
            }
          >
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="decimal"
                required
                className="font-mono"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            )}
          </FormField>
          <FormField name="start_date" label="Fecha de inicio" error={errors.start_date}>
            {(a11y) => <DatePicker {...a11y} name="start_date" value={start} onChange={setStart} />}
          </FormField>
          <FormField name="term_days" label="Plazo (días)" error={errors.term_days}>
            {(a11y) => (
              <Input
                {...a11y}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                className="font-mono"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            )}
          </FormField>
          {/* Se calcula sola: fecha de inicio + plazo */}
          <div className="flex flex-col gap-2" aria-live="polite">
            <span className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Fecha de entrega
            </span>
            <span className="num flex h-10 items-center text-lg">{end ? formatIso(end) : "—"}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {end ? `Inicio + ${termDays} días` : "Elige el inicio y el plazo"}
            </span>
          </div>
        </CellGrid>
      </PageSection>

      <div className="flex flex-col gap-4 p-6">
        {state?.error && <FieldError>{state.error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="min-h-11 sm:min-h-10">
            {pending ? "Creando…" : "Crear contrato"}
          </Button>
          <Link
            href={`/${org}/contratos`}
            className={buttonVariants({ variant: "outline" }) + " min-h-11 sm:min-h-10"}
          >
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  );
}
