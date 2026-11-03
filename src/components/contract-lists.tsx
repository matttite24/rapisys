"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  BarCode01Icon,
  Building03Icon,
  Car01Icon,
  Delete02Icon,
  Edit02Icon,
  EngineIcon,
  IdentityCardIcon,
  LeftToRightListBulletIcon,
  Tag01Icon,
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
import { Field, FieldError } from "@/components/ui/field";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { cn } from "@/lib/utils";

// Una lista de referencia del contrato: los datos del activo al que sirve.
export type ListView = {
  id: string;
  assetId: string | null;
  name: string;
  // Datos del activo del catálogo (vacíos en una lista general).
  kind: string;
  brand: string;
  model: string;
  serial: string;
  engine: string;
  identifier: string;
};

// Botón inicial de la fila: abre un cajón con todas las listas y un buscador (sirve con muchas).
function AllLists({
  lists,
  counts,
  activeId,
  onSelect,
}: {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? lists.filter((l) =>
        [l.name, l.brand, l.model, l.serial, l.identifier].some((v) => v.toLowerCase().includes(term)),
      )
    : lists;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <button
        type="button"
        aria-label={`Ver todas las listas (${lists.length})`}
        title="Todas las listas"
        onClick={() => setOpen(true)}
        className="flex h-12 shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
      </button>
      <SheetContent className="gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Listas del contrato</SheetTitle>
          <SheetDescription>
            {lists.length} {lists.length === 1 ? "lista" : "listas"}. Elige una para abrirla.
          </SheetDescription>
        </SheetHeader>
        <div className="border-b p-4">
          <Input
            type="search"
            autoFocus
            autoComplete="off"
            aria-label="Buscar lista"
            placeholder="Nombre, marca, modelo o serie"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ul aria-label="Listas" className="min-h-0 flex-1 divide-y overflow-y-auto">
          {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Ninguna lista coincide.</li>}
          {shown.map((l) => {
            const active = l.id === activeId;
            const detail = [l.brand, l.model, l.serial].filter(Boolean).join(" · ");
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    onSelect(l.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-14 w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-accent",
                    active ? "border-l-brand bg-foreground/[0.06]" : "border-l-transparent",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("break-words", active && "font-bold")}>{l.name}</span>
                    {detail && <span className="truncate font-mono text-xs text-muted-foreground">{detail}</span>}
                  </span>
                  <span className="num pt-0.5 text-xs text-muted-foreground">{counts[l.id] ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

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
      <AllLists lists={lists} counts={counts} activeId={activeId} onSelect={onSelect} />
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
  const general = !list.assetId;

  return (
    <div className={cn("border-b", editing && "bg-muted")}>
      <div className={cn("flex items-center justify-between gap-4 px-6", general ? "py-2" : "py-4")}>
        {general ? (
          <p className="text-sm text-muted-foreground">
            Lista general: sin un activo en particular.
          </p>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-x-12 gap-y-4">
            <Datum icon={Tag01Icon} label="Tipo" value={ASSET_KIND_LABEL[list.kind as AssetKind] ?? ""} />
            <Datum icon={Building03Icon} label="Marca" value={list.brand} />
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

type Step = "search" | "asset" | "name";

// Crear una lista, en pasos separados dentro de un modal: buscar el activo y elegirlo; si no
// existe, crearlo y guardarlo en el catálogo; o usar solo un nombre (lista general).
export function NewListDialog({
  org,
  contractId,
  open,
  onOpenChange,
  onCreated,
}: {
  org: string;
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssetResult[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<QuickAssetState>();
  const errors = state?.fields ?? {};

  function reset() {
    setStep("search");
    setQ("");
    setResults(null);
    setState(undefined);
    setSaving(false);
  }

  function search(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchAssets(org, value)), 250);
  }

  // Crea la lista (con o sin activo) y la abre.
  function createFor(name: string, assetId?: string) {
    setSaving(true);
    setState(undefined);
    startTransition(async () => {
      const data = new FormData();
      data.set("name", name);
      if (assetId) data.set("asset_id", assetId);
      const res = await createList(org, contractId, data);
      setSaving(false);
      if (res?.error || res?.fields) return setState({ error: res.error ?? Object.values(res.fields ?? {})[0] });
      onOpenChange(false);
      reset();
      if (res?.id) onCreated(res.id);
    });
  }

  function submitAsset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setState(undefined);
    startTransition(async () => {
      const get = (k: string) => String(data.get(k) ?? "");
      const res = await quickCreateAsset(org, {
        name: get("asset_name"),
        kind: get("asset_kind"),
        brand: get("asset_brand"),
        model: get("asset_model"),
        serial: get("asset_serial"),
        engine: get("asset_engine"),
        identifier: get("asset_identifier"),
      });
      if (res?.asset) {
        setSaving(false);
        createFor(res.asset.name, res.asset.id);
      } else {
        setSaving(false);
        setState(res);
      }
    });
  }

  function submitName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const name = String(new FormData(e.currentTarget).get("list_name") ?? "").trim();
    if (!name) return setState({ fields: { name: "Escribe el nombre de la lista." } });
    createFor(name);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) void searchAssets(org, "").then(setResults);
        else reset();
      }}
    >
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {step === "search" && (
          <>
            <DialogHeader className="border-b p-6">
              <DialogTitle>Nueva lista</DialogTitle>
              <DialogDescription>Busca el activo al que pertenece la lista.</DialogDescription>
            </DialogHeader>
            <div className="border-b p-4">
              <Input
                type="search"
                autoFocus
                autoComplete="off"
                aria-label="Buscar activo"
                placeholder="Nombre, marca, modelo, serie o placa"
                value={q}
                onChange={(e) => search(e.target.value)}
              />
            </div>
            <ul aria-label="Activos del catálogo" className="max-h-72 min-h-24 divide-y overflow-y-auto">
              {results === null && <li className="p-4 text-sm text-muted-foreground">Buscando…</li>}
              {results?.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Ningún activo coincide con la búsqueda.</li>
              )}
              {results?.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={saving}
                    className="flex min-h-14 w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-accent disabled:opacity-60"
                    onClick={() => createFor(a.name, a.id)}
                  >
                    <span className="font-medium">{a.name}</span>
                    {[a.brand, a.model, a.serial].some(Boolean) && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {[a.brand, a.model, a.serial].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {results && results.length >= 30 && (
                <li className="p-4 text-xs text-muted-foreground">Se muestran los primeros 30. Afina la búsqueda.</li>
              )}
            </ul>
            {state?.error && <div className="border-t p-4"><FieldError>{state.error}</FieldError></div>}
            <div className="flex flex-wrap gap-2 border-t p-4">
              <Button type="button" className="h-10 gap-2" onClick={() => setStep("asset")}>
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
                {q.trim() ? `Crear activo “${q.trim()}”` : "Crear activo nuevo"}
              </Button>
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep("name")}>
                Solo un nombre
              </Button>
            </div>
          </>
        )}

        {step === "asset" && (
          <form onSubmit={submitAsset} noValidate>
            <DialogHeader className="border-b p-6">
              <DialogTitle>Nuevo activo</DialogTitle>
              <DialogDescription>Se guarda en el catálogo y se crea la lista con él.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-x-4 gap-y-5 p-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField name="asset_name" label="Nombre" error={errors.name}>
                  {(a11y) => <Input {...a11y} autoFocus autoComplete="off" maxLength={200} defaultValue={q} />}
                </FormField>
              </div>
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
              <FormField name="asset_brand" label="Marca" error={errors.brand}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} />}
              </FormField>
              <FormField name="asset_model" label="Modelo" error={errors.model}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} />}
              </FormField>
              <FormField name="asset_serial" label="Serie" error={errors.serial}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" />}
              </FormField>
              <FormField name="asset_engine" label="Motor" error={errors.engine}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" />}
              </FormField>
              <FormField name="asset_identifier" label="Identificador" error={errors.identifier}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" />}
              </FormField>
              {state?.error && (
                <div className="sm:col-span-2">
                  <FieldError>{state.error}</FieldError>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button type="submit" disabled={saving} className="h-10">
                {saving ? "Creando…" : "Guardar activo y crear lista"}
              </Button>
              <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => { setState(undefined); setStep("search"); }}>
                Volver
              </Button>
            </div>
          </form>
        )}

        {step === "name" && (
          <form onSubmit={submitName} noValidate>
            <DialogHeader className="border-b p-6">
              <DialogTitle>Lista sin activo</DialogTitle>
              <DialogDescription>Para una lista general, que no es de un activo en particular.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 p-6">
              <FormField name="list_name" label="Nombre de la lista" error={errors.name}>
                {(a11y) => <Input {...a11y} autoFocus autoComplete="off" maxLength={200} placeholder="Lista general" />}
              </FormField>
              {state?.error && <FieldError>{state.error}</FieldError>}
            </div>
            <div className="flex gap-2 border-t p-4">
              <Button type="submit" disabled={saving} className="h-10">
                {saving ? "Creando…" : "Crear lista"}
              </Button>
              <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => { setState(undefined); setStep("search"); }}>
                Volver
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Corrige una lista ya creada. Si es de un activo, edita los datos del activo (son suyos);
// una lista general solo tiene nombre.
export function ListDetailsForm({
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
  const isAsset = Boolean(list.assetId);

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus();
  }, []);

  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-x-4 gap-y-5 md:grid-cols-4 md:items-start [&_input]:bg-background [&_select]:bg-background"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (!String(data.get("name") ?? "").trim()) {
          return submit(async () => ({ fields: { name: "Escribe el nombre del activo o de la lista." } }));
        }
        submit(() => updateList(org, contractId, list.id, data));
      }}
    >
      <div className={isAsset ? "md:col-span-2" : "md:col-span-4"}>
        <FormField name="name" label={isAsset ? "Nombre del activo" : "Nombre de la lista"} error={errors.name}>
          {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} defaultValue={list.name} />}
        </FormField>
      </div>
      {isAsset && (
        <>
          <FormField name="kind" label="Tipo" error={errors.kind}>
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" defaultValue={list.kind}>
                <option value="">Selecciona…</option>
                {Object.entries(ASSET_KIND_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="brand" label="Marca" error={errors.brand}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} defaultValue={list.brand} />}
          </FormField>
          <FormField name="model" label="Modelo" error={errors.model}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} defaultValue={list.model} />}
          </FormField>
          <FormField name="serial" label="Serie" error={errors.serial}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.serial} />}
          </FormField>
          <FormField name="engine" label="Motor" error={errors.engine}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.engine} />}
          </FormField>
          <FormField name="identifier" label="Identificador" error={errors.identifier}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.identifier} />}
          </FormField>
        </>
      )}
      <Field className="md:col-span-4">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="h-10 gap-2">
            <HugeiconsIcon icon={Tick02Icon} className="size-5" strokeWidth={2} />
            {saving ? "Guardando…" : "Guardar"}
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
