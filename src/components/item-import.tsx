"use client";

import { startTransition, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadIcon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { importItems } from "@/lib/item-import-actions";
import { COLUMNS, TEMPLATE, buildRows, readItemsCsv, type ColumnKey, type RawRow } from "@/lib/item-csv";
import { cn } from "@/lib/utils";

// Importar items de bodega desde un CSV: elegir archivo → elegir qué columnas cargar → revisar → importar (todo o nada).
export function ItemImport({ org }: { org: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [present, setPresent] = useState<ColumnKey[]>([]);
  const [selected, setSelected] = useState<Set<ColumnKey>>(new Set());
  const [error, setError] = useState<string>();
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setFileName(""); setRaw([]); setPresent([]); setSelected(new Set()); setError(undefined); setServerErrors({}); setSaving(false);
    if (input.current) input.current.value = "";
  }

  async function pick(file: File) {
    reset();
    setFileName(file.name);
    const read = readItemsCsv(await file.text());
    if (read.error) setError(read.error);
    setRaw(read.rows);
    setPresent(read.present);
    // Todo lo que se puede cargar viene marcado; el usuario desmarca lo que no quiere.
    setSelected(new Set(COLUMNS.filter((c) => c.importable && read.present.includes(c.key)).map((c) => c.key)));
  }

  function toggle(key: ColumnKey) {
    setServerErrors({});
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const rows = useMemo(() => buildRows(raw, selected), [raw, selected]);
  const problems = (i: number) => rows[i].error ?? serverErrors[i];
  const bad = rows.filter((_, i) => problems(i)).length;
  const shown = COLUMNS.filter((c) => present.includes(c.key));

  function run() {
    if (saving || bad) return;
    setSaving(true);
    setError(undefined);
    setServerErrors({});
    startTransition(async () => {
      const res = await importItems(org, rows);
      setSaving(false);
      if (res?.rowErrors) { setServerErrors(res.rowErrors); setError("Corrige las filas marcadas: desmarca la columna o cambia el archivo."); }
      else if (res?.error) setError(res.error);
      else { setOpen(false); reset(); router.refresh(); }
    });
  }

  function template() {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "plantilla-items.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* En el encabezado, a la izquierda de «Nuevo item». */}
      <HeaderAction icon={FileUploadIcon} label="Importar CSV" onClick={() => setOpen(true)} secondary />
      <Sheet open={open} onOpenChange={(next, details) => {
        if (next) return setOpen(true);
        if (details.reason === "outside-press") return details.cancel();
        setOpen(false); reset();
      }}>
        <SheetContent side="bottom" className="data-[side=bottom]:h-[92svh] gap-0">
          <SheetHeader>
            <SheetTitle>Importar items desde CSV</SheetTitle>
            <SheetDescription className="sr-only">Elige un archivo CSV, marca las columnas que quieres cargar, revisa lo leído e impórtalo a la bodega.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 border-b p-6">
              <p className="text-sm text-muted-foreground">
                Sube el CSV tal como lo exporta el sistema anterior y marca abajo las columnas que quieres cargar. Si el SKU ya existe no se importa nada.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="h-9" onClick={() => input.current?.click()}>Elegir archivo CSV</Button>
                <Button type="button" variant="ghost" className="h-9" onClick={template}>Descargar plantilla</Button>
                {fileName && <span className="font-mono text-xs text-muted-foreground">{fileName}</span>}
                <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
              </div>
              {error && <FieldError>{error}</FieldError>}
              {shown.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="pb-1 caps text-muted-foreground">Columnas a cargar</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {shown.map((c) => {
                      const locked = c.required || !c.importable;
                      return (
                        <label key={c.key} className={cn("flex items-center gap-2 text-sm", !c.importable && "text-muted-foreground")}>
                          <input type="checkbox" className="size-4" checked={selected.has(c.key)} disabled={locked} onChange={() => toggle(c.key)} />
                          {c.label}
                          {c.required && <span className="text-xs text-muted-foreground">(obligatoria)</span>}
                          {!c.importable && <span className="text-xs">(solo se muestra, no se importa)</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
            {rows.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left caps"><tr>
                  <th className="px-4 py-2">N.º</th>
                  {shown.map((c) => <th key={c.key} className={cn("px-2 py-2", !selected.has(c.key) && "opacity-50")}>{c.label}</th>)}
                  <th className="px-4 py-2">Estado</th>
                </tr></thead>
                <tbody>
                  {raw.map((r, i) => (
                    <tr key={i} className={cn("border-b align-top", problems(i) && "bg-destructive/5")}>
                      <td className="num px-4 py-2 text-muted-foreground">{i + 1}</td>
                      {shown.map((c) => <td key={c.key} className={cn("px-2 py-2", !selected.has(c.key) && "text-muted-foreground line-through opacity-50")}>{r[c.key]}</td>)}
                      <td className="px-4 py-2 text-xs">{problems(i) ? <span className="text-destructive">{problems(i)}</span> : <span className="text-muted-foreground">Lista</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t p-4">
            <span className="text-sm text-muted-foreground">{rows.length ? `${rows.length} filas${bad ? ` · ${bad} con problema` : ""}` : "Sin archivo"}</span>
            <Button type="button" disabled={saving || rows.length === 0 || bad > 0} onClick={run}>
              {saving ? "Importando…" : `Importar ${rows.length || ""} items`.trim()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
