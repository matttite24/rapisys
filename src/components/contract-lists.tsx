"use client";

import { ConfirmTap } from "@/components/confirm-tap";
import { CELL_ROW } from "@/components/cell-header";
import { TabCount } from "@/components/count-tabs";
import { FolderTabs } from "@/components/folder-tabs";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  ArrowDown01Icon,
  LeftToRightListBulletIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchInput } from "@/components/search-input";
import { AssetFactsLine, AssetFactsWrap, assetFactList } from "@/components/asset-facts";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetClose,
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
  recentAssets,
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
  // Cuántas líneas tiene la lista (sin cargarlas).
  count: number;
  // Datos del activo del catálogo (vacíos en una lista general).
  kind: string;
  brand: string;
  model: string;
  serial: string;
  engine: string;
  year: string;
  identifier: string;
  other: string;
  plate: string;
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
        className="mr-2 mb-px flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
      </button>
      <SheetContent side="left" showCloseButton={false} className="gap-0 bg-background data-[side=left]:w-full data-[side=left]:sm:max-w-md">
        <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
          <SheetTitle className="caps-md min-w-0 truncate font-medium">Listas del contrato</SheetTitle>
          <SheetDescription className="sr-only">
            {lists.length} {lists.length === 1 ? "lista" : "listas"}. Elige una para abrirla.
          </SheetDescription>
          <SheetClose render={<Button variant="ghost" size="icon" aria-label="Cerrar listas" />}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </SheetClose>
        </SheetHeader>
        <div className="flex h-12 border-b">
          <SearchInput
            label="Buscar lista"
            placeholder="Buscar por nombre, marca, modelo o serie"
            value={q}
            onChange={setQ}
            autoFocus
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
                  <TabCount n={counts[l.id] ?? 0} active={active} />
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
  onSelect,
}: {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <FolderTabs
      label="Listas del contrato"
      tabs={lists.map((l) => ({ key: l.id, label: l.name, count: counts[l.id] ?? 0 }))}
      activeKey={activeId}
      onSelect={onSelect}
      leading={<AllLists lists={lists} counts={counts} activeId={activeId} onSelect={onSelect} />}
    />
  );
}

// Dato del activo con su ícono: etiqueta pequeña arriba y valor abajo. El nombre ya está en la pestaña.

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(0);
  const facts = assetFactList(list);

  async function remove() {
    setPending(true);
    setError(undefined);
    try {
      const res = await deleteList(org, contractId, list.id);
      if (res?.error) setError(res.error);
    } finally {
      setPending(false);
    }
  }

  // Una lista general solo tiene nombre: no se muestran datos vacíos.
  const general = !list.assetId;

  return (
    <div className={cn("border-b", editing && "bg-muted")}>
      {/* Mismo alto que la fila de la factura elegida en el panel de asignar (5 rem con su línea). */}
      <div className="flex h-14 items-center justify-between gap-4 pr-6">
        {general ? (
          // Lista general: solo lleva nombre, sin datos de activo (serie, motor, etc.). No hay nada que abrir.
          <div className="flex min-w-0 flex-1 items-center gap-3 pl-6">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-[1.125rem]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Lista general</p>
              <p className="truncate text-xs text-muted-foreground">Sin activo: no lleva datos como serie o motor.</p>
            </div>
          </div>
        ) : (
          // Una sola línea con los datos que caben; si quedan otros, "+N" y un toque los despliega debajo (solo esos, sin repetir).
          facts.length === 0 ? (
            <p className="pl-6 text-sm text-muted-foreground">
              Este activo aún no tiene datos.{canEdit ? " Usa el lápiz para completarlos." : ""}
            </p>
          ) : (
            <div className="flex h-full min-w-0 flex-1 items-center gap-3 pl-6">
              <div className="min-w-0 flex-1 cursor-text select-text">
                <AssetFactsLine facts={facts} onHiddenChange={setHidden} />
              </div>
              {/* Solo el control expande los datos; el texto queda libre para seleccionar y copiar. */}
              <div className="flex w-14 shrink-0 items-center justify-end">
                {hidden > 0 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`datos-${list.id}`}
                    aria-label={expanded ? "Ocultar los demás datos del activo" : `Ver ${hidden} ${hidden === 1 ? "dato más" : "datos más"} del activo`}
                    onClick={() => setExpanded((v) => !v)}
                    className="flex h-9 items-center justify-end gap-1 px-1 text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="num">+{hidden}</span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      aria-hidden
                      className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
                    />
                  </button>
                )}
              </div>
            </div>
          )
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
              <ConfirmTap
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                aria-label="Eliminar la lista"
                disabled={pending}
                hint={
                  lineCount === 0
                    ? "Toca otra vez para eliminar la lista"
                    : `Toca otra vez: se eliminan también sus ${lineCount} ${lineCount === 1 ? "línea" : "líneas"}`
                }
                onConfirm={() => void remove()}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </ConfirmTap>
            </>
          )}
        </div>
      </div>
      {!general && expanded && hidden > 0 && (
        <div id={`datos-${list.id}`} className="border-t px-6 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <AssetFactsWrap facts={facts.slice(facts.length - hidden)} />
        </div>
      )}
      {error && <p role="alert" className="border-t p-3 text-sm text-destructive">{error}</p>}
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
  const latest = useRef("");
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssetResult[] | null>(null);
  // Al abrir solo se piden los 5 recientes; la búsqueda empieza al escribir (2 letras o más).
  const [recents, setRecents] = useState<AssetResult[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<QuickAssetState>();
  const errors = state?.fields ?? {};

  // El padre abre el modal (botón del encabezado o Alt+N): al abrirse se piden los recientes. Si se cierra y se vuelve a
  // abrir, se piden de nuevo (puede haber activos nuevos).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void recentAssets(org).then((r) => alive && setRecents(r));
    return () => {
      alive = false;
    };
  }, [open, org]);

  function reset() {
    setStep("search");
    setQ("");
    latest.current = "";
    setResults(null);
    setRecents(null);
    setState(undefined);
    setSaving(false);
  }

  const searching = q.trim().length >= 2;
  const shown = searching ? results : recents;

  function search(value: string) {
    setQ(value);
    latest.current = value;
    clearTimeout(timer.current);
    if (value.trim().length < 2) return setResults(null);
    setResults(null);
    timer.current = setTimeout(async () => {
      const found = await searchAssets(org, value);
      // Si mientras tanto se siguió escribiendo, esta respuesta ya no vale.
      if (latest.current === value) setResults(found);
    }, 300);
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
        year: get("asset_year"),
        identifier: get("asset_identifier"),
        other: get("asset_other"),
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
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {step === "search" && (
          <>
            <DialogHeader className="border-b p-6">
              <DialogTitle>Nueva lista</DialogTitle>
              <DialogDescription>Elige un activo reciente o busca el que corresponde a la lista.</DialogDescription>
            </DialogHeader>
            <div className="flex h-12 border-b">
              <SearchInput
                label="Buscar activo"
                placeholder="Escribe 2 letras para buscar"
                value={q}
                onChange={search}
                autoFocus
              />
            </div>
            {/* Sin texto: solo los recientes (no se busca nada). Con 2 letras o más: los resultados de la búsqueda. */}
            <p className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
              {searching ? "Resultados" : "Recientes"}
            </p>
            <ul aria-label={searching ? "Resultados de la búsqueda" : "Activos recientes"} className="max-h-72 min-h-24 divide-y overflow-y-auto">
              {shown === null && <li className="p-4 text-sm text-muted-foreground">{searching ? "Buscando…" : "Cargando…"}</li>}
              {shown?.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">
                  {searching ? "Ningún activo coincide con la búsqueda." : "Aún no hay activos recientes. Escribe para buscar o crea uno."}
                </li>
              )}
              {shown?.map((a) => (
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
              {searching && results && results.length >= 12 && (
                <li className="p-4 text-xs text-muted-foreground">Se muestran los primeros 12. Afina la búsqueda.</li>
              )}
            </ul>
            {state?.error && <div className="border-t p-4"><FieldError>{state.error}</FieldError></div>}
            <div className="flex flex-wrap gap-2 border-t p-4">
              <Button type="button" className="h-10 gap-2" onClick={() => setStep("asset")}>
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
                {q.trim() ? `Crear activo “${q.trim()}”` : "Crear activo nuevo"}
              </Button>
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep("name")}>
                Lista sin activo
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
              <FormField name="asset_engine" label="Serie del motor" error={errors.engine}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" />}
              </FormField>
              <FormField name="asset_year" label="Año de fabricación" error={errors.year}>
                {(a11y) => <Input {...a11y} autoComplete="off" inputMode="numeric" maxLength={4} className="font-mono" />}
              </FormField>
              <FormField name="asset_identifier" label="N.º de identificación" error={errors.identifier}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" />}
              </FormField>
              <FormField name="asset_other" label="Otro" error={errors.other}>
                {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} />}
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
          <FormField name="engine" label="Serie del motor" error={errors.engine}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.engine} />}
          </FormField>
          <FormField name="year" label="Año de fabricación" error={errors.year}>
            {(a11y) => <Input {...a11y} autoComplete="off" inputMode="numeric" maxLength={4} className="font-mono" defaultValue={list.year} />}
          </FormField>
          <FormField name="identifier" label="N.º de identificación" error={errors.identifier}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={100} className="font-mono" defaultValue={list.identifier} />}
          </FormField>
          <FormField name="other" label="Otro" error={errors.other}>
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} defaultValue={list.other} />}
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
