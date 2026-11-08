"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createContract, updateContract } from "@/lib/contract-form-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CellGrid, PageSection } from "@/components/page-section";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchInput } from "@/components/search-input";
import { searchParties } from "@/lib/party-search-actions";
import { CLIENT_TYPES } from "@/lib/parties";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { cn } from "@/lib/utils";
import { VAT_RATE } from "@/lib/contracts";
import { addDaysIso, formatIso } from "@/lib/dates";
import { centsToInput, formatCents, parseCents, splitVat } from "@/lib/money";


// Datos de un contrato existente, para corregirlo mientras está en estado Nuevo.
export type ContractData = {
  id: string;
  name: string;
  code: string;
  clientId: string;
  managerId: string;
  totalCents: number;
  vatRate?: number;
  startDate: string;
  termDays: number;
};
type Errors = Record<string, string>;
const NEW = "__new__";

// Buscador de un registro existente (por nombre o RUC), o alta rápida con nombre, RUC y dirección.
function PartyPicker({
  org,
  prefix,
  label,
  errors,
  initial,
}: {
  org: string;
  prefix: "client" | "manager";
  label: string;
  errors: Errors;
  initial?: { id: string; name: string };
}) {
  // value: id elegido, NEW (alta rápida) o vacío.
  const [value, setValue] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [q, setQ] = useState("");
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchParties(org, prefix, text));
  const field = `${prefix}_id`;

  return (
    <div className="flex flex-col gap-4">
      <FormField name={field} label={label} error={errors[field]}>
        {() =>
          value ? (
            <div id={field} className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-base md:text-sm">
              <span className="min-w-0 truncate">{value === NEW ? "Nuevo (se crea al guardar)" : name}</span>
              <Button type="button" variant="ghost" size="sm" className="h-[1.5rem]" onClick={() => setValue("")}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div
              className="relative"
              onFocus={() => {
                if (results === null && !loading && !q.trim()) run("", 0);
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) clear();
              }}
            >
              <SearchInput
                variant="field"
                id={field}
                label={`${label}: busca por nombre o RUC`}
                placeholder="Busca por nombre o RUC"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  if (v.trim()) run(v);
                  else run("", 0);
                }}
                onKeyDown={(e) => e.key === "Escape" && clear()}
              />
              {(results !== null || loading) && (
                <ul
                  aria-label={label}
                  aria-busy={loading}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 divide-y overflow-y-auto border bg-popover shadow-overlay transition-opacity",
                    loading && results !== null && "opacity-60",
                  )}
                >
                  {results === null ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
                  ) : (
                    <>
                      {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Ninguno coincide.</li>}
                      {results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setValue(r.id);
                              setName(r.name);
                              setQ("");
                              clear();
                            }}
                          >
                            <span>{r.name}</span>
                            {r.ruc && <span className="font-mono text-xs text-muted-foreground">{r.ruc}</span>}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-medium hover:bg-accent"
                          onClick={() => {
                            setValue(NEW);
                            setQ("");
                            clear();
                          }}
                        >
                          + Crear nuevo…
                        </button>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>
          )
        }
      </FormField>
      <input type="hidden" name={field} value={value} />

      {value === NEW && (
        <div className="flex flex-col gap-4 border bg-muted/50 p-4">
          {prefix === "client" && <FormField name="client_type" label="Tipo de cliente" error={errors.client_type}>
            {(props) => <NativeSelect {...props} className="w-full" required defaultValue=""><option value="" disabled>Selecciona…</option>{Object.entries(CLIENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}
          </FormField>}
          <FormField name={`${prefix}_name`} label="Nombre" error={errors[`${prefix}_name`]}>
            {(a11y) => <Input {...a11y} required />}
          </FormField>
          <FormField name={`${prefix}_ruc`} label="RUC o cédula (opcional)" hint="13 o 10 dígitos">
            {(a11y) => <NumericInput {...a11y} maxLength={13} className="font-mono" />}
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
  clientName,
  managerName,
  contract,
  onDone,
}: {
  org: string;
  // Nombre del cliente y del responsable guardados (solo al editar), para mostrarlos sin cargar toda la lista.
  clientName?: string;
  managerName?: string;
  contract?: ContractData;
  // Dentro de un panel: se llama al guardar o al cancelar, y reemplaza el regreso a la lista.
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    contract ? updateContract.bind(null, org, contract.id) : createContract,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [total, setTotal] = useState(contract ? centsToInput(contract.totalCents) : "");
  const [start, setStart] = useState(contract?.startDate ?? "");
  const [days, setDays] = useState(contract ? String(contract.termDays) : "");

  const errors: Errors = state?.fields ?? {};
  const parsed = parseCents(total);
  const vat = contract?.vatRate ?? VAT_RATE;
  const breakdown = parsed.ok ? splitVat(parsed.cents, vat) : null;
  const termDays = Number(days);
  // El plazo debe ser un entero mayor a 0; vacío o inválido no genera fecha.
  const end = days.trim() && Number.isInteger(termDays) && termDays > 0 ? addDaysIso(start, termDays) : null;

  useEffect(() => {
    if (state?.saved) onDone?.();
  }, [state, onDone]);

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
            {(a11y) => <Input {...a11y} required autoFocus={!contract} defaultValue={contract?.name} />}
          </FormField>
          <FormField name="code" label="Código del contrato" error={errors.code}>
            {(a11y) => <Input {...a11y} required className="font-mono" defaultValue={contract?.code} />}
          </FormField>
        </CellGrid>
      </PageSection>

      <PageSection index="02" label="Partes" className="p-0">
        <CellGrid className="border-0 md:grid-cols-2">
          <PartyPicker org={org} prefix="client" label="Cliente" errors={errors} initial={contract ? { id: contract.clientId, name: clientName ?? "" } : undefined} />
          <PartyPicker org={org} prefix="manager" label="Responsable de contrato" errors={errors} initial={contract ? { id: contract.managerId, name: managerName ?? "" } : undefined} />
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
                ? `Subtotal ${formatCents(breakdown.subtotal)} · IVA ${vat}% ${formatCents(breakdown.vat)}`
                : `Se desglosa el IVA ${vat}% automáticamente`
            }
          >
            {(a11y) => <MoneyInput {...a11y} name="total" required value={total} onChange={setTotal} />}
          </FormField>
          <FormField name="start_date" label="Fecha de inicio" error={errors.start_date}>
            {(a11y) => <DatePicker {...a11y} name="start_date" value={start} onChange={setStart} />}
          </FormField>
          <FormField name="term_days" label="Plazo (días)" error={errors.term_days}>
            {(a11y) => (
              <NumericInput
                {...a11y}
                required
                maxLength={4}
                className="font-mono"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            )}
          </FormField>
          {/* Se calcula sola: fecha de inicio + plazo */}
          <div className="flex flex-col gap-2" aria-live="polite">
            <span className="caps font-medium text-muted-foreground">
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
        {state?.saved && (
          <p role="status" className="caps-md">
            Cambios guardados
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending
              ? contract ? "Guardando…" : "Creando…"
              : contract ? "Guardar cambios" : "Crear contrato"}
          </Button>
          {onDone ? (
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
          ) : (
            <Link
              href={`/${org}/contratos`}
              className={buttonVariants({ variant: "outline" })}
            >
              {contract ? "Volver a la lista" : "Cancelar"}
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
