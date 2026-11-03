"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Add01Icon, Delete02Icon, Edit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { CellGrid } from "@/components/page-section";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createList,
  deleteList,
  searchAssets,
  updateList,
  type AssetResult,
  type ListState,
} from "@/lib/contract-list-actions";
import { cn } from "@/lib/utils";

// Una lista de referencia del contrato: los datos del activo al que sirve.
export type ListView = {
  id: string;
  assetId: string | null;
  name: string;
  model: string;
  serial: string;
  engine: string;
  identifier: string;
};

type NavProps = {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
};

// Cuerpo de la columna de opciones: buscador, listas con scroll propio y "Nueva lista" fijo al pie.
export function ListNav({ lists, counts, activeId, canAdd, onSelect, onNew }: NavProps) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? lists.filter((l) => [l.name, l.model, l.serial, l.identifier].some((v) => v.toLowerCase().includes(term)))
    : lists;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em]">
        <span>Listas</span>
        <span className="num text-muted-foreground">{lists.length}</span>
      </div>
      {lists.length > 6 && (
        <div className="border-b p-2">
          <Input
            type="search"
            aria-label="Buscar lista"
            placeholder="Buscar activo, modelo, serie…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-background"
          />
        </div>
      )}
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" role="list">
        {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Ninguna lista coincide.</li>}
        {shown.map((l) => {
          const active = l.id === activeId;
          return (
            <li key={l.id} className="border-b">
              <button
                type="button"
                onClick={() => onSelect(l.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-2 border-l-2 px-4 py-2.5 text-left transition-colors hover:bg-accent",
                  active ? "border-l-brand bg-foreground/[0.06]" : "border-l-transparent",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "break-words font-mono text-xs uppercase tracking-[0.06em]",
                      active ? "font-bold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {l.name}
                  </span>
                  {(l.model || l.serial) && (
                    <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                      {[l.model, l.serial].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="num pt-0.5 text-xs text-muted-foreground">{counts[l.id] ?? 0}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canAdd && (
        <button
          type="button"
          onClick={onNew}
          className="flex h-11 shrink-0 items-center gap-2 border-t px-4 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Nueva lista
        </button>
      )}
    </div>
  );
}

// Versión compacta (móvil, o con la columna oculta): un selector y "Nueva lista".
export function ListSelect({ lists, counts, activeId, canAdd, onSelect, onNew, className }: NavProps & { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 border-b p-4", className)}>
      <NativeSelect
        aria-label="Lista del contrato"
        className="min-w-0 flex-1"
        value={activeId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({counts[l.id] ?? 0})
          </option>
        ))}
      </NativeSelect>
      {canAdd && (
        <Button variant="outline" onClick={onNew}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Nueva
        </Button>
      )}
    </div>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="break-words">{value || "—"}</span>
    </div>
  );
}

// Datos del activo de la lista abierta, con editar y eliminar.
export function ListInfo({
  org,
  contractId,
  list,
  lineCount,
  canEdit,
  editing,
  onEdit,
}: {
  org: string;
  contractId: string;
  list: ListView;
  lineCount: number;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setPending(true);
    setError(undefined);
    const res = await deleteList(org, contractId, list.id);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      setConfirming(false);
    }
  }

  return (
    <div className={cn("border-b", editing && "bg-muted")}>
      <CellGrid className="border-0 md:grid-cols-[2fr_1fr_1fr_1fr_1.2fr_auto]">
        <Datum label="Activo" value={list.name} />
        <Datum label="Modelo" value={list.model} />
        <Datum label="Serie" value={list.serial} />
        <Datum label="Motor" value={list.engine} />
        <Datum label="Identificador" value={list.identifier} />
        <div className="flex items-start gap-1">
          {canEdit &&
            (confirming ? (
              <span className="flex flex-col gap-2">
                <span className="max-w-48 text-xs text-muted-foreground">
                  Se eliminan también sus {lineCount} {lineCount === 1 ? "línea" : "líneas"}.
                </span>
                <span className="flex gap-2">
                  <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
                    Eliminar
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(false)}>
                    No
                  </Button>
                </span>
              </span>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="Editar los datos de la lista"
                  aria-pressed={editing}
                  onClick={onEdit}
                >
                  <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                  aria-label="Eliminar la lista"
                  onClick={() => setConfirming(true)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              </>
            ))}
        </div>
      </CellGrid>
      {error && <p role="alert" className="border-t p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}

// Crea o edita una lista. El activo se busca en el catálogo o se escribe solo para este contrato.
export function ListForm({
  org,
  contractId,
  editing,
  onDone,
}: {
  org: string;
  contractId: string;
  editing: ListView | null;
  onDone: (id?: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [name, setName] = useState(editing?.name ?? "");
  const [model, setModel] = useState(editing?.model ?? "");
  const [assetId, setAssetId] = useState(editing?.assetId ?? "");
  const [results, setResults] = useState<AssetResult[] | null>(null);
  const [state, setState] = useState<ListState>();
  const [saving, setSaving] = useState(false);
  const errors = state?.fields ?? {};

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, []);

  // Busca en el servidor con una pausa corta; escribir un nombre propio desvincula el catálogo.
  function onName(value: string) {
    setName(value);
    setAssetId("");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchAssets(org, value)), 250);
  }

  function choose(a: AssetResult) {
    setName(a.name);
    setModel(a.model ?? "");
    setAssetId(a.id);
    setResults(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    if (!name.trim()) {
      setState({ fields: { name: "Escribe el nombre del activo." } });
      return;
    }
    setSaving(true);
    setState(undefined);
    startTransition(async () => {
      const res = editing
        ? await updateList(org, contractId, editing.id, data)
        : await createList(org, contractId, data);
      setSaving(false);
      if (res?.error || res?.fields) setState(res);
      else onDone(res?.id);
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_1.2fr_3.5rem] md:items-start [&_input]:bg-background"
    >
      <input type="hidden" name="asset_id" value={assetId} />
      <div className="flex flex-col gap-2">
        <FormField
          name="name"
          label="Activo"
          error={errors.name}
          hint={assetId ? "Del catálogo" : undefined}
        >
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="off"
              maxLength={200}
              placeholder="Busca en el catálogo o escribe uno nuevo"
              value={name}
              onChange={(e) => onName(e.target.value)}
              onFocus={() => results === null && onName(name)}
              onBlur={() => setTimeout(() => setResults(null), 150)}
            />
          )}
        </FormField>
        {results !== null && (
          <ul aria-label="Activos del catálogo" className="max-h-56 divide-y overflow-y-auto border bg-popover">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Ninguno coincide: se usará solo en este contrato.
              </li>
            ) : (
              results.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    // mousedown: elige antes de que el campo pierda el foco
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(a);
                    }}
                  >
                    <span className="truncate">{a.name}</span>
                    {a.model && (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{a.model}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <FormField name="model" label="Modelo" error={errors.model}>
        {(a11y) => (
          <Input {...a11y} autoComplete="off" maxLength={100} value={model} onChange={(e) => setModel(e.target.value)} />
        )}
      </FormField>
      <FormField name="serial" label="Serie" error={errors.serial}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={editing?.serial} />}
      </FormField>
      <FormField name="engine" label="Motor" error={errors.engine}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={editing?.engine} />}
      </FormField>
      <FormField name="identifier" label="Identificador" error={errors.identifier}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={editing?.identifier} />}
      </FormField>
      <Field>
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <Button
          type="submit"
          size="icon"
          disabled={saving}
          className="h-10 w-full"
          aria-label={editing ? "Guardar lista" : "Crear lista"}
          title={editing ? "Guardar lista" : "Crear lista"}
        >
          <HugeiconsIcon icon={editing ? Tick02Icon : Add01Icon} className="size-6" strokeWidth={2} />
        </Button>
      </Field>
      {state?.error && (
        <div className="md:col-span-6">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
