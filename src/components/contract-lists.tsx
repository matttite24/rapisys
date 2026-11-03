"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  BarCode01Icon,
  Car01Icon,
  Delete02Icon,
  Edit02Icon,
  EngineIcon,
  IdentityCardIcon,
  LeftToRightListBulletIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createList,
  deleteList,
  quickCreateAsset,
  searchAssets,
  updateList,
  type AssetResult,
  type ListState,
  type QuickAssetState,
} from "@/lib/contract-list-actions";
import { ASSET_KIND_LABEL } from "@/lib/items";
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

// Pestañas: una por lista, con su cantidad de líneas.
export function ListTabs({
  lists,
  counts,
  activeId,
  canAdd,
  onSelect,
  onNew,
}: {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div role="tablist" aria-label="Listas del contrato" className="flex gap-6 overflow-x-auto border-b px-6">
      {/* Un solo ícono para toda la fila: indica que son las listas del contrato. */}
      <span className="flex h-12 shrink-0 items-center text-muted-foreground" title="Listas">
        <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" aria-hidden />
      </span>
      {lists.map((l) => {
        const active = l.id === activeId;
        return (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(l.id)}
            className={cn(
              "-mb-px flex h-12 max-w-64 shrink-0 items-center gap-2 border-b-2 font-mono text-xs uppercase tracking-[0.08em] transition-colors",
              active
                ? "border-b-brand font-bold text-foreground"
                : "border-b-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{l.name}</span>
            <span
              className={cn(
                "num rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none",
                active ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {counts[l.id] ?? 0}
            </span>
          </button>
        );
      })}
      {canAdd && (
        <button
          type="button"
          onClick={onNew}
          className="flex h-12 shrink-0 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Nueva lista
        </button>
      )}
    </div>
  );
}

// Dato del activo con su ícono: etiqueta pequeña arriba y valor abajo. El nombre ya está en la pestaña.
function Datum({ icon, label, value }: { icon: IconSvgElement; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <HugeiconsIcon icon={icon} className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        <span className="break-all font-mono text-sm">{value || "—"}</span>
      </div>
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
    if (res?.error) setError(res.error);
  }

  // Una lista general solo tiene nombre: no se muestran datos vacíos.
  const general = !list.model && !list.serial && !list.engine && !list.identifier;

  return (
    <div className={cn("border-b", editing && "bg-muted")}>
      <div className={cn("flex items-center justify-between gap-4 px-6", general ? "py-2" : "py-4")}>
        {general ? (
          <p className="text-sm text-muted-foreground">
            Lista general: sin datos de un activo en particular.
          </p>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-x-12 gap-y-4">
            <Datum icon={Car01Icon} label="Modelo" value={list.model} />
            <Datum icon={BarCode01Icon} label="Serie" value={list.serial} />
            <Datum icon={EngineIcon} label="Motor" value={list.engine} />
            <Datum icon={IdentityCardIcon} label="Identificador" value={list.identifier} />
          </div>
        )}
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          {canEdit && (
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
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="border-t p-3 text-sm text-destructive">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la lista de {list.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {lineCount === 0
                ? "La lista no tiene items."
                : `Se eliminan también sus ${lineCount} ${lineCount === 1 ? "línea" : "líneas"}.`}{" "}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Sí, eliminar lista
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Cajón para buscar un activo del catálogo (sirve con muchos) o darlo de alta si no existe.
function AssetPicker({ org, onPick }: { org: string; onPick: (a: AssetResult) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssetResult[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<QuickAssetState>();
  const errors = state?.fields ?? {};

  function search(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchAssets(org, value)), 250);
  }

  function pick(a: AssetResult) {
    onPick(a);
    setOpen(false);
    setCreating(false);
    setState(undefined);
  }

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    setSaving(true);
    startTransition(async () => {
      const res = await quickCreateAsset(
        org,
        String(data.get("asset_name") ?? ""),
        String(data.get("asset_kind") ?? ""),
        String(data.get("asset_model") ?? ""),
      );
      setSaving(false);
      if (res?.asset) pick(res.asset);
      else setState(res);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void searchAssets(org, q).then(setResults);
        else {
          setCreating(false);
          setState(undefined);
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 shrink-0"
        aria-label="Buscar en el catálogo de activos"
        title="Buscar en el catálogo"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Search01Icon} className="size-5" />
      </Button>
      <SheetContent className="gap-0 sm:max-w-md">
        {creating ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>Nuevo activo</SheetTitle>
              <SheetDescription>Se guarda en el catálogo y queda elegido para la lista.</SheetDescription>
            </SheetHeader>
            <form onSubmit={create} noValidate className="flex flex-col gap-5 p-4">
              <FormField name="asset_name" label="Nombre" error={errors.name}>
                {(a11y) => <Input {...a11y} autoFocus autoComplete="off" maxLength={200} defaultValue={q} />}
              </FormField>
              <FormField name="asset_kind" label="Tipo" error={errors.kind}>
                {(a11y) => (
                  <NativeSelect {...a11y} className="w-full" defaultValue="">
                    <option value="">Selecciona…</option>
                    {Object.entries(ASSET_KIND_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField name="asset_model" label="Modelo (opcional)" error={errors.model}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} />}
              </FormField>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="h-10">
                  {saving ? "Creando…" : "Crear y usar"}
                </Button>
                <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => setCreating(false)}>
                  Volver
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>Buscar activo en el catálogo</SheetTitle>
              <SheetDescription>Elige uno para usarlo en la lista, o crea uno nuevo si no existe.</SheetDescription>
            </SheetHeader>
            <div className="border-b p-4">
              <Input
                type="search"
                autoFocus
                autoComplete="off"
                aria-label="Buscar activo"
                placeholder="Nombre, marca, modelo o placa"
                value={q}
                onChange={(e) => search(e.target.value)}
              />
            </div>
            <ul aria-label="Activos del catálogo" className="min-h-0 flex-1 divide-y overflow-y-auto">
              {results === null && <li className="p-4 text-sm text-muted-foreground">Buscando…</li>}
              {results?.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Ningún activo coincide con la búsqueda.</li>
              )}
              {results?.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-accent"
                    onClick={() => pick(a)}
                  >
                    <span className="font-medium">{a.name}</span>
                    {[a.brand, a.model, a.plate].some(Boolean) && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {[a.brand, a.model, a.plate].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {results && results.length >= 30 && (
                <li className="p-4 text-xs text-muted-foreground">Se muestran los primeros 30. Afina la búsqueda.</li>
              )}
            </ul>
            <div className="border-t p-4">
              <Button type="button" variant="outline" className="h-10 w-full gap-2" onClick={() => setCreating(true)}>
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
                {q.trim() ? `Crear activo “${q.trim()}”` : "Crear activo nuevo"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Crear una lista es un solo paso: el nombre (a mano o de un activo del catálogo).
// Los datos de la máquina (modelo, serie, motor, identificador) se completan después, al editarla.
export function ListForm({
  org,
  contractId,
  editing,
  onDone,
  onCancel,
}: {
  org: string;
  contractId: string;
  editing: ListView | null;
  onDone: (id?: string) => void;
  onCancel?: () => void;
}) {
  return editing ? (
    <ListDetailsForm org={org} contractId={contractId} list={editing} onDone={onDone} onCancel={onCancel} />
  ) : (
    <ListCreateForm org={org} contractId={contractId} onDone={onDone} onCancel={onCancel} />
  );
}

function useListSubmit(onDone: (id?: string) => void) {
  const [state, setState] = useState<ListState>();
  const [saving, setSaving] = useState(false);
  function submit(run: () => Promise<ListState>) {
    if (saving) return;
    setSaving(true);
    setState(undefined);
    startTransition(async () => {
      const res = await run();
      setSaving(false);
      if (res?.error || res?.fields) setState(res);
      else onDone(res?.id);
    });
  }
  return { state, saving, submit };
}

function ListCreateForm({
  org,
  contractId,
  onDone,
  onCancel,
}: {
  org: string;
  contractId: string;
  onDone: (id?: string) => void;
  onCancel?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [assetId, setAssetId] = useState("");
  const { state, saving, submit } = useListSubmit(onDone);
  const errors = state?.fields ?? {};

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, []);

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4 md:flex-row md:items-start [&_input]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return submit(async () => ({ fields: { name: "Escribe el nombre del activo o de la lista." } }));
        const data = new FormData(e.currentTarget);
        submit(() => createList(org, contractId, data));
      }}
    >
      <input type="hidden" name="asset_id" value={assetId} />
      <div className="min-w-0 md:max-w-xl md:flex-1">
        <FormField
          name="name"
          label="Nombre del activo o de la lista"
          error={errors.name}
          hint={assetId ? "Activo del catálogo" : "Escribe un nombre (p. ej. “Lista general”) o busca un activo."}
        >
          {(a11y) => (
            <div className="flex gap-2">
              <Input
                {...a11y}
                autoComplete="off"
                maxLength={200}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setAssetId(""); // un nombre escrito a mano desvincula el activo
                }}
              />
              <AssetPicker
                org={org}
                onPick={(a) => {
                  setName(a.name);
                  setAssetId(a.id);
                }}
              />
            </div>
          )}
        </FormField>
      </div>
      <Field className="md:w-auto">
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="h-10 gap-2">
            <HugeiconsIcon icon={Add01Icon} className="size-5" strokeWidth={2} />
            {saving ? "Creando…" : "Crear nueva lista"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </Field>
      {state?.error && <FieldError>{state.error}</FieldError>}
    </form>
  );
}

// Corrige los datos de una lista ya creada.
function ListDetailsForm({
  org,
  contractId,
  list,
  onDone,
  onCancel,
}: {
  org: string;
  contractId: string;
  list: ListView;
  onDone: (id?: string) => void;
  onCancel?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, saving, submit } = useListSubmit(onDone);
  const errors = state?.fields ?? {};

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, []);

  const mono = "font-mono";
  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-x-4 gap-y-5 md:grid-cols-4 md:items-start [&_input]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (!String(data.get("name") ?? "").trim()) {
          return submit(async () => ({ fields: { name: "Escribe el nombre del activo o de la lista." } }));
        }
        submit(() => updateList(org, contractId, list.id, data));
      }}
    >
      <div className="md:col-span-2">
        <FormField name="name" label="Nombre" error={errors.name}>
          {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} defaultValue={list.name} />}
        </FormField>
      </div>
      <FormField name="model" label="Modelo" error={errors.model}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} defaultValue={list.model} />}
      </FormField>
      <FormField name="serial" label="Serie" error={errors.serial}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className={mono} defaultValue={list.serial} />}
      </FormField>
      <FormField name="engine" label="Motor" error={errors.engine}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className={mono} defaultValue={list.engine} />}
      </FormField>
      <FormField name="identifier" label="Identificador" error={errors.identifier}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className={mono} defaultValue={list.identifier} />}
      </FormField>
      <Field className="md:col-span-2">
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="h-10 gap-2">
            <HugeiconsIcon icon={Tick02Icon} className="size-5" strokeWidth={2} />
            {saving ? "Guardando…" : "Guardar lista"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </Field>
      {state?.error && (
        <div className="md:col-span-4">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
