"use client";

import { startTransition, useEffect, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchInput } from "@/components/search-input";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createList, quickCreateAsset, recentAssets, searchAssets, type AssetResult, type QuickAssetState } from "@/lib/contract-list-actions";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { ASSET_KIND_LABEL } from "@/lib/items";

export type Step = "search" | "asset" | "name";

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
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const { results, error: searchError, run, clear } = useDebouncedSearch((text: string) => searchAssets(org, text));
  const [recentError, setRecentError] = useState("");
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
    void recentAssets(org).then((r) => { if (alive) { setRecentError(""); setRecents(r); } }).catch(() => { if (alive) setRecentError("No se pudieron cargar los activos recientes."); });
    return () => {
      alive = false;
      clear();
    };
  }, [open, org, clear]);

  function reset() {
    setStep("search");
    setQ("");
    clear();
    setRecentError("");
    setRecents(null);
    setState(undefined);
    setSaving(false);
  }

  const searching = q.trim().length >= 2;
  const shown = searching ? results : recents;
  const queryError = searching ? searchError : recentError;

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) clear();
    else run(value);

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
              {queryError && <li role="alert" className="p-4 text-sm text-destructive">{queryError}</li>}
              {!queryError && shown === null && <li className="p-4 text-sm text-muted-foreground">{searching ? "Buscando…" : "Cargando…"}</li>}
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
              <Button type="button" className="h-9 gap-2" onClick={() => setStep("asset")}>
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
                {q.trim() ? `Crear activo “${q.trim()}”` : "Crear activo nuevo"}
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => setStep("name")}>
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
              <Button type="submit" disabled={saving} className="h-9">
                {saving ? "Creando…" : "Guardar activo y crear lista"}
              </Button>
              <Button type="button" variant="outline" className="h-9" disabled={saving} onClick={() => { setState(undefined); setStep("search"); }}>
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
              <Button type="submit" disabled={saving} className="h-9">
                {saving ? "Creando…" : "Crear lista"}
              </Button>
              <Button type="button" variant="outline" className="h-9" disabled={saving} onClick={() => { setState(undefined); setStep("search"); }}>
                Volver
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
