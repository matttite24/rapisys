"use client";

import { Fragment, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cancel01Icon, FileUploadIcon, ImageUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addLines, getListKeys } from "@/lib/contract-actions";
import { MAX_LINES_PER_LIST } from "@/lib/contracts";
import { findDuplicates } from "@/lib/duplicates";
import { gridFromImage } from "@/lib/ocr-engine";
import { readSheet } from "@/lib/sheet-actions";
import { splitCsv } from "@/lib/item-csv";
import { openPdf, parsePageRange, type PdfHandle } from "@/lib/pdf-table";
import { FIELDS, applyMapping, guessMapping, looksLikeHeader, normalizeGrid, type Field, type Grid, type Mapping } from "@/lib/table-map";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type Step = "start" | "pages" | "reading" | "map" | "review";

type Row = {
  id: number;
  part: string;
  description: string;
  quantity: string;
  unit: string;
  // Precio referencial total de la fila (sin IVA): se escribe a mano al revisar.
  price: string;
  raw: string;
  review: boolean;
  // Sección del proceso (fila de ancho completo) a la que pertenece.
  group?: string;
};

const REVIEW_PAGE = 100;
const MAP_PREVIEW = 300;

// Una fila de la revisión. Está memorizada: al escribir en una fila no se redibujan las demás.
const ReviewRow = memo(function ReviewRow({
  row: r,
  index: i,
  dupKind,
  dupRef,
  errors,
  onPatch,
  onRemove,
}: {
  row: Row;
  index: number;
  dupKind?: "batch" | "existing";
  dupRef?: number;
  errors: Record<string, string>;
  onPatch: (id: number, change: Partial<Row>) => void;
  onRemove: (id: number) => void;
}) {
  const err = (f: string) => errors[`${i}.${f}`];
  return (
    <tr className={cn("border-b align-top last:border-b-0", r.review && "bg-muted")}>
      <td className="num px-4 py-2 text-right text-muted-foreground">{i + 1}</td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Número de parte, fila ${i + 1}`} aria-invalid={!!err("part_number") || undefined} className="h-8 font-mono" value={r.part} onChange={(e) => onPatch(r.id, { part: e.target.value })} />
      </td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Descripción, fila ${i + 1}`} aria-invalid={!!err("description") || undefined} className="h-8" value={r.description} onChange={(e) => onPatch(r.id, { description: e.target.value })} />
        {dupKind && (
          <p className="pt-1 text-xs font-medium text-destructive">
            {dupKind === "batch"
              ? `Duplicado: igual a la fila ${dupRef} de esta carga`
              : `Ya está en la lista (línea ${dupRef})`}
          </p>
        )}
        {r.review && r.raw && <p className="pt-1 font-mono text-2xs text-muted-foreground">Leído: {r.raw}</p>}
        {(err("description") || err("part_number")) && <p className="pt-1 text-xs text-destructive">{err("description") ?? err("part_number")}</p>}
      </td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Cantidad, fila ${i + 1}`} aria-invalid={!!err("quantity") || undefined} inputMode="decimal" className="h-8 font-mono" value={r.quantity} onChange={(e) => onPatch(r.id, { quantity: e.target.value })} />
        {err("quantity") && <p className="pt-1 text-xs text-destructive">{err("quantity")}</p>}
      </td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Precio ref. total, fila ${i + 1}`} aria-invalid={!!err("reference_price") || undefined} inputMode="decimal" placeholder="0,00" className="h-8 text-right font-mono" value={r.price} onChange={(e) => onPatch(r.id, { price: e.target.value })} />
        {err("reference_price") && <p className="pt-1 text-xs text-destructive">{err("reference_price")}</p>}
      </td>
      <td className="px-3 py-1.5">
        <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Quitar la fila ${i + 1}`} onClick={() => onRemove(r.id)}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </td>
    </tr>
  );
});

// Carga masiva de la lista abierta: captura → lectura (OCR) → revisión editable → carga.
export function BulkImport({
  org,
  contractId,
  listId,
  listName,
  listCount,
}: {
  org: string;
  contractId: string;
  listId: string;
  listName: string;
  // Cuántas líneas tiene la lista (para respetar el tope al cargar).
  listCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("start");
  const [imageUrl, setImageUrl] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  // Tabla leída tal cual (antes de decidir qué es cada columna), el mapeo elegido y las filas que se dejan fuera.
  const [grid, setGrid] = useState<Grid>([]);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string>();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [onlyDup, setOnlyDup] = useState(false);
  // Lo que la lista ya tiene (se pide al abrir), para avisar de repetidos.
  const [existing, setExisting] = useState<{ part: string; description: string }[]>([]);
  const [reviewPage, setReviewPage] = useState(0);
  // PDF abierto: se elige qué páginas se leen (no todas son listas).
  const pdf = useRef<PdfHandle | null>(null);
  const [pdfPages, setPdfPages] = useState<{ count: number; list: number[] }>({ count: 0, list: [] });
  const [pickedPages, setPickedPages] = useState<Set<number>>(new Set());
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState(false);
  const nextId = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);

  // La URL de la captura se libera al cambiarla, al reiniciar y al cerrar.
  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  function closePdf() {
    void pdf.current?.close();
    pdf.current = null;
    setPdfPages({ count: 0, list: [] });
    setPickedPages(new Set());
    setThumbs({});
    setRangeText("");
    setRangeError(false);
  }

  // Miniaturas de las páginas, una a una, mientras se ve la selección.
  useEffect(() => {
    if (step !== "pages" || !pdf.current) return;
    const handle = pdf.current;
    let alive = true;
    (async () => {
      for (let n = 1; n <= handle.numPages && alive; n++) {
        try {
          const url = await handle.thumbnail(n);
          if (alive) setThumbs((t) => ({ ...t, [n]: url }));
        } catch {
          /* sin miniatura: se ve solo el número */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  function reset() {
    closePdf();
    setStep("start");
    setImageUrl(undefined);
    setProgress(0);
    setRows([]);
    setSkipped(0);
    setGrid([]);
    setMapping([]);
    setHasHeader(true);
    setSkipRows(new Set());
    setFileName("");
    setRawText("");
    setError(undefined);
    setRowErrors({});
    setSaving(false);
    setOnlyDup(false);
    setReviewPage(0);
  }

  // Archivo → tabla de celdas. Imagen: OCR; .csv: se lee aquí; .xlsx: lo lee el servidor. Después, el mapeo de columnas.
  async function start(file: File) {
    setError(undefined);
    setFileName(file.name || "captura");
    const isImage = file.type.startsWith("image/");
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const isXlsx = /\.xlsx$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (!isImage && !isCsv && !isXlsx && !isPdf) return setError("Usa un PDF, una imagen, un CSV o un Excel (.xlsx).");
    if (isImage) setImageUrl(URL.createObjectURL(file));
    setProgress(0);
    if (isPdf) {
      setStep("reading");
      try {
        const handle = await openPdf(file);
        if (!handle.hasText) {
          await handle.close();
          throw new Error("Este PDF no tiene texto (parece un escaneo). Sube una captura de la tabla para leerla con OCR.");
        }
        closePdf();
        pdf.current = handle;
        setPdfPages({ count: handle.numPages, list: handle.listPages });
        // Se proponen las páginas que parecen listas; si ninguna lo parece, se elige a mano.
        setPickedPages(new Set(handle.listPages));
        setRangeText("");
        setStep("pages");
      } catch (e) {
        console.error("Carga masiva (PDF)", e);
        setError(e instanceof Error && e.message ? e.message : "No se pudo abrir el PDF. Inténtalo de nuevo.");
        setStep("start");
      }
      return;
    }
    setStep("reading");
    try {
      let table: Grid;
      if (isImage) {
        const { grid: g, raw } = await gridFromImage(file, setProgress);
        setRawText(raw);
        table = g;
      } else if (isCsv) {
        table = normalizeGrid(splitCsv(await file.text()));
      } else {
        const fd = new FormData();
        fd.set("file", file);
        const res = await readSheet(fd);
        if (!res.rows) throw new Error(res.error ?? "No se pudo leer el archivo.");
        table = normalizeGrid(res.rows);
      }
      if (table.length === 0) throw new Error(isImage ? "No se reconoció ninguna tabla. Prueba con una captura más grande o más nítida." : "El archivo no tiene filas.");
      const header = looksLikeHeader(table[0]);
      setGrid(table);
      setHasHeader(header);
      setMapping(header ? guessMapping(table[0]) : table[0].map(() => null));
      setSkipRows(new Set());
      setStep("map");
    } catch (e) {
      console.error("Carga masiva", e);
      setError(e instanceof Error && e.message ? e.message : "No se pudo leer el archivo. Inténtalo de nuevo.");
      setStep("start");
    }
  }

  // Lee solo las páginas elegidas del PDF y pasa al mapeo de columnas.
  async function readPickedPages() {
    const handle = pdf.current;
    if (!handle || pickedPages.size === 0) return;
    setError(undefined);
    setProgress(0);
    setStep("reading");
    try {
      const table = normalizeGrid(await handle.read([...pickedPages].sort((a, b) => a - b), setProgress));
      if (table.length === 0) throw new Error("No se encontró ninguna tabla en las páginas elegidas.");
      const header = looksLikeHeader(table[0]);
      setGrid(table);
      setHasHeader(header);
      setMapping(header ? guessMapping(table[0]) : table[0].map(() => null));
      setSkipRows(new Set());
      setStep("map");
    } catch (e) {
      console.error("Carga masiva (PDF)", e);
      setError(e instanceof Error && e.message ? e.message : "No se pudo leer el PDF. Inténtalo de nuevo.");
      setStep("pages");
    }
  }

  function togglePage(n: number) {
    setPickedPages((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function applyRange(text: string) {
    setRangeText(text);
    if (!text.trim()) return setRangeError(false);
    const pages = parsePageRange(text, pdfPages.count);
    setRangeError(!pages);
    if (pages) setPickedPages(new Set(pages));
  }

  // Del mapeo a las filas editables de la revisión.
  function applyColumns() {
    const mapped = applyMapping(grid, mapping, (i) => !(hasHeader && i === 0) && !skipRows.has(i), { fixCodes: !!imageUrl });
    setSkipped(grid.length - mapped.length);
    setRows(mapped.map((r) => ({ id: nextId.current++, part: r.part, description: r.description, quantity: r.quantity, unit: r.unit, price: r.price, raw: r.raw, review: r.review })));
    setRowErrors({});
    setError(undefined);
    setReviewPage(0);
    setStep("review");
  }

  function pickColumn(col: number, field: Field | null) {
    setMapping((m) => m.map((f, i) => (i === col ? field : field && f === field ? null : f)));
  }

  function toggleHeader(on: boolean) {
    setHasHeader(on);
    if (on && grid[0]) setMapping(guessMapping(grid[0]));
  }

  function toggleRow(i: number) {
    setSkipRows((cur) => {
      const next = new Set(cur);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  // Ctrl+V con una captura en el portapapeles, mientras el modal espera una imagen.
  useEffect(() => {
    if (!open || step !== "start") return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void start(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, step]);

  // Tocar una fila la da por revisada: se le quita el resaltado.
  const patch = useCallback((id: number, change: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change, review: change.review ?? false } : r)));
  }, []);
  const removeRow = useCallback((id: number) => setRows((rs) => rs.filter((x) => x.id !== id)), []);

  function load() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    setRowErrors({});
    startTransition(async () => {
      const res = await addLines(
        org,
        contractId,
        listId,
        rows.map((r) => ({ partNumber: r.part, description: r.description, quantity: r.quantity, unit: r.unit, referencePrice: r.price })),
      );
      setSaving(false);
      if (res?.error) setError(res.error);
      else if (res?.fields) {
        setRowErrors(res.fields);
        setError("Corrige las filas marcadas antes de cargar.");
      } else {
        setOpen(false);
        reset();
      }
    });
  }

  const toReview = rows.filter((r) => r.review).length;
  const dups = useMemo(() => findDuplicates(rows, existing), [rows, existing]);
  const dupCount = dups.filter(Boolean).length;
  const repeats = dups.filter((d) => d?.kind === "batch").length;
  // Si ya no quedan duplicados, el filtro "solo duplicados" no tiene sentido.
  const showOnlyDup = onlyDup && dupCount > 0;

  // Con muchas filas se revisa por páginas: dibujar cientos de campos editables a la vez es pesado.
  const visible = rows.map((_, i) => i).filter((i) => !showOnlyDup || dups[i]);
  const reviewPages = Math.max(1, Math.ceil(visible.length / REVIEW_PAGE));
  const safePage = Math.min(reviewPage, reviewPages - 1);
  const pageIdx = visible.slice(safePage * REVIEW_PAGE, (safePage + 1) * REVIEW_PAGE);

  // El tope de la lista: lo ya cargado más lo nuevo no puede pasar de MAX_LINES_PER_LIST.
  const overBy = listCount + rows.length - MAX_LINES_PER_LIST;

  // Quita lo repetido dentro de lo que se va a cargar (deja la primera aparición).
  // Lo que ya está en la lista no se toca solo: puede ser a propósito.
  function removeRepeats() {
    setRows((rs) => {
      const d = findDuplicates(rs, existing);
      return rs.filter((_, i) => d[i]?.kind !== "batch");
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2.5"
        onClick={() => {
          setOpen(true);
          void getListKeys(contractId, listId).then(setExisting);
        }}
      >
        <HugeiconsIcon icon={FileUploadIcon} className="size-4" />
        Carga masiva
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next, details) => {
          if (next) return setOpen(true);
          // Un clic afuera nunca cierra: se pierde lo cargado con demasiada facilidad.
          if (details.reason === "outside-press") return details.cancel();
          // Con datos leídos o en proceso, cerrar (X o Esc) pide confirmación.
          if (step !== "start") {
            details.cancel();
            return setConfirmClose(true);
          }
          setOpen(false);
          reset();
        }}
      >
        <SheetContent side="bottom" className="data-[side=bottom]:h-[92svh] gap-0">
          <SheetHeader>
            <SheetTitle>Carga masiva en «{listName}»</SheetTitle>
            <SheetDescription className="sr-only">
              Sube un PDF, un Excel, un CSV o una captura, elige qué columna es cada dato, revisa y cárgalo a la lista.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">

          {step === "start" && (
            <div className="p-6">
              <p className="pb-4 text-sm text-muted-foreground">
                Sube un PDF con texto, un Excel (.xlsx), un CSV o una captura de la tabla. Después eliges qué columna es cada dato. Los PDF y las capturas se leen en tu navegador: el archivo no sale de tu equipo.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) void start(file);
                }}
                className={cn(
                  "flex flex-col items-center gap-4 border border-dashed px-6 py-16 text-center",
                  dragging ? "border-primary bg-primary/5" : "bg-muted/40",
                )}
              >
                <HugeiconsIcon icon={ImageUploadIcon} className="size-10 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Pega una captura con Ctrl + V</p>
                  <p className="text-sm text-muted-foreground">o arrastra aquí un PDF, un Excel, un CSV o una imagen</p>
                </div>
                <Button type="button" variant="outline" className="h-9" onClick={() => fileInput.current?.click()}>
                  Elegir archivo
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,.pdf,application/pdf,.csv,.xlsx,text/csv"
                  aria-label="Elegir el archivo o la captura"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void start(file);
                  }}
                />
              </div>
              {error && <div className="pt-4"><FieldError>{error}</FieldError></div>}
            </div>
          )}

          {step === "pages" && (
            <div className="flex flex-col gap-4 p-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{fileName}</span> tiene {pdfPages.count} {pdfPages.count === 1 ? "página" : "páginas"}. Elige las que tienen listas
                de ítems; solo esas se leen.
                {pdfPages.list.length > 0 && " Marqué las que parecen listas (traen descripción y cantidad)."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Páginas a leer"
                  aria-invalid={rangeError || undefined}
                  placeholder="Ej.: 3-7, 12"
                  className="h-9 w-44 font-mono"
                  value={rangeText}
                  onChange={(e) => applyRange(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { setRangeText(""); setPickedPages(new Set(Array.from({ length: pdfPages.count }, (_, i) => i + 1))); }}>
                  Todas
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setRangeText(""); setPickedPages(new Set()); }}>
                  Ninguna
                </Button>
                {pdfPages.list.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setRangeText(""); setPickedPages(new Set(pdfPages.list)); }}>
                    Solo las que parecen listas
                  </Button>
                )}
                {rangeError && <span role="alert" className="text-xs text-destructive">Escribe páginas entre 1 y {pdfPages.count}, como 3-7, 12.</span>}
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: pdfPages.count }, (_, i) => i + 1).map((n) => {
                  const on = pickedPages.has(n);
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`Página ${n}`}
                        onClick={() => togglePage(n)}
                        className={cn(
                          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden border bg-muted/40 transition-colors hover:border-foreground/40",
                          on && "border-primary shadow-[inset_0_0_0_2px_var(--primary)]",
                        )}
                      >
                        {thumbs[n] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbs[n]} alt="" className="size-full object-cover object-top" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Cargando…</span>
                        )}
                        <span className={cn("absolute top-1.5 left-1.5 grid size-5 place-items-center border bg-background text-xs", on && "border-primary bg-primary text-primary-foreground")}>
                          {on ? "✓" : ""}
                        </span>
                        <span className="num absolute right-0 bottom-0 bg-background/90 px-1.5 py-0.5 font-mono text-xs">
                          {n}
                          {pdfPages.list.includes(n) && <span className="ml-1 text-state-stock-ink">· lista</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && <FieldError>{error}</FieldError>}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background py-3">
                <Button type="button" variant="ghost" onClick={() => { reset(); }}>
                  Cambiar archivo
                </Button>
                <Button type="button" disabled={pickedPages.size === 0} onClick={() => void readPickedPages()}>
                  Leer {pickedPages.size} {pickedPages.size === 1 ? "página" : "páginas"}
                </Button>
              </div>
            </div>
          )}

          {step === "reading" && (
            <div className="flex flex-col items-center gap-4 p-16 text-center">
              <p className="font-medium">Leyendo {fileName || "el archivo"}…</p>
              <div className="h-1.5 w-full max-w-sm bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">La primera vez tarda más: descarga el idioma de lectura.</p>
            </div>
          )}

          {step === "map" && (
            <>
              <div className="flex flex-col gap-3 border-b p-4">
                <p className="text-sm text-muted-foreground">
                  Esto es lo que se leyó de <span className="font-mono">{fileName}</span>: {grid.length} {grid.length === 1 ? "fila" : "filas"} y {grid[0]?.length ?? 0} columnas.
                  Elige arriba de cada columna qué dato es. Quita la marca de una fila para dejarla fuera.
                </p>
                <label className="flex w-fit items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
                  La primera fila es el encabezado
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b text-left">
                      <th className="w-px px-3 py-2 caps font-bold">Usar</th>
                      <th className="w-px px-2 py-2 text-right caps font-bold">Fila</th>
                      {(grid[0] ?? []).map((_, c) => (
                        <th key={c} className="min-w-40 px-2 py-2 font-normal">
                          <NativeSelect
                            aria-label={`Qué es la columna ${c + 1}`}
                            className={cn("w-full", mapping[c] ? "font-semibold" : "text-muted-foreground")}
                            value={mapping[c] ?? ""}
                            onChange={(e) => pickColumn(c, (e.target.value || null) as Field | null)}
                          >
                            <option value="">No usar</option>
                            {FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </NativeSelect>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.slice(0, MAP_PREVIEW).map((cells, i) => {
                      const off = (hasHeader && i === 0) || skipRows.has(i);
                      return (
                        <tr key={i} className={cn("border-b align-top", off && "bg-muted/50 text-muted-foreground line-through")}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="size-4"
                              aria-label={`Usar la fila ${i + 1}`}
                              checked={!(hasHeader && i === 0) && !skipRows.has(i)}
                              disabled={hasHeader && i === 0}
                              onChange={() => toggleRow(i)}
                            />
                          </td>
                          <td className="num px-2 py-2 text-right text-muted-foreground">{i + 1}</td>
                          {cells.map((cell, c) => (
                            <td key={c} className={cn("px-2 py-2", mapping[c] ? "" : "opacity-50", mapping[c] === "part" && "font-mono")}>{cell}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {grid.length > MAP_PREVIEW && (
                  <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                    Se muestran las primeras {MAP_PREVIEW} filas; las demás se cargan con el mismo mapeo.
                  </p>
                )}
              </div>
            </>
          )}

          {step === "review" && (
            <>
              {/* Fila 1: la captura y la información de lo que se leyó. */}
              <div className="grid gap-px border-b bg-border md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:bg-popover">
                <div className="p-4">
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="Captura original" className="max-h-44 w-full border object-contain object-left" />
                  )}
                </div>
                <div className="flex flex-col justify-center gap-3 p-6">
                  <dl className="grid grid-cols-4 gap-4 font-mono">
                    <div>
                      <dt className="caps text-muted-foreground">Leídas</dt>
                      <dd className="num text-xl">{rows.length}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Por revisar</dt>
                      <dd className={cn("num text-xl", toReview > 0 && "text-destructive")}>{toReview}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Duplicados</dt>
                      <dd className={cn("num text-xl", dupCount > 0 && "text-destructive")}>{dupCount}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Descartados</dt>
                      <dd className="num text-xl text-muted-foreground">{skipped}</dd>
                    </div>
                  </dl>
                  <p className="text-sm text-muted-foreground">
                    Compara con la captura. Las filas en ámbar son las dudosas; los números de parte son lo más fácil de leer mal.
                  </p>
                  {dupCount > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" aria-pressed={showOnlyDup} onClick={() => {
                          setOnlyDup((v) => !v);
                          setReviewPage(0);
                        }}>
                        {showOnlyDup ? "Ver todas las filas" : "Ver solo duplicados"}
                      </Button>
                      {repeats > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={removeRepeats}>
                          Quitar repetidos del lote ({repeats})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Fila 2: la tabla, a todo el ancho. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b text-left caps font-bold">
                      <th className="w-px px-4 py-2 text-right">N.º</th>
                      <th className="w-56 px-2 py-2">Part. num.</th>
                      <th className="px-2 py-2">Descripción</th>
                      <th className="w-32 px-2 py-2">Cantidad</th>
                      <th className="w-44 px-2 py-2 text-right">Precio ref. (total)</th>
                      <th className="w-px px-3 py-2"><span className="sr-only">Quitar</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-muted-foreground">
                          No se reconoció ninguna fila. Prueba con una captura más grande o más nítida.
                          <details className="pt-3 text-xs">
                            <summary className="cursor-pointer">Texto que leyó el OCR</summary>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap pt-2 font-mono">{rawText || "(nada)"}</pre>
                          </details>
                        </td>
                      </tr>
                    )}
                    {pageIdx.map((i, n) => (
                      <Fragment key={rows[i].id}>
                        {rows[i].group && rows[i].group !== rows[pageIdx[n - 1]]?.group && (
                          <tr className="border-b bg-muted/60">
                            <td colSpan={6} className="px-4 py-2 caps font-medium">{rows[i].group}</td>
                          </tr>
                        )}
                        <ReviewRow
                          row={rows[i]}
                          index={i}
                          dupKind={dups[i]?.kind}
                          dupRef={dups[i]?.ref}
                          errors={rowErrors}
                          onPatch={patch}
                          onRemove={removeRow}
                        />
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {reviewPages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t px-4 py-2 caps-md">
                  <Button type="button" variant="outline" size="sm" disabled={safePage === 0} onClick={() => setReviewPage(safePage - 1)}>
                    ← Anteriores
                  </Button>
                  <span className="text-muted-foreground">
                    Filas {safePage * REVIEW_PAGE + 1}–{Math.min(visible.length, (safePage + 1) * REVIEW_PAGE)} de {visible.length}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={safePage >= reviewPages - 1} onClick={() => setReviewPage(safePage + 1)}>
                    Siguientes →
                  </Button>
                </div>
              )}
            </>
          )}
          </div>

          {step === "map" && (
            <div className="relative z-10 shrink-0 border-t bg-popover [box-shadow:0_-8px_16px_-10px_color-mix(in_oklch,var(--foreground)_30%,transparent)]">
              {error && <div className="border-b p-4"><FieldError>{error}</FieldError></div>}
              <div className="flex flex-wrap items-center gap-2 p-4">
                <Button type="button" className="h-9" disabled={!mapping.includes("description") || !mapping.includes("quantity") || grid.length - skipRows.size - (hasHeader ? 1 : 0) <= 0} onClick={applyColumns}>
                  Continuar
                </Button>
                <Button type="button" variant="outline" className="h-9" onClick={reset}>Otro archivo</Button>
                {(!mapping.includes("description") || !mapping.includes("quantity")) && (
                  <span className="text-sm text-muted-foreground">Elige al menos la columna de Descripción y la de Cantidad.</span>
                )}
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="relative z-10 shrink-0 border-t bg-popover [box-shadow:0_-8px_16px_-10px_color-mix(in_oklch,var(--foreground)_30%,transparent)]">
              {overBy > 0 && (
                <div className="border-b p-4">
                  <FieldError>
                    La lista tendría {(listCount + rows.length).toLocaleString("es-EC")} líneas y el máximo es{" "}
                    {MAX_LINES_PER_LIST.toLocaleString("es-EC")}. Quita {overBy} {overBy === 1 ? "fila" : "filas"} para poder cargar.
                  </FieldError>
                </div>
              )}
              {error && <div className="border-b p-4"><FieldError>{error}</FieldError></div>}
              <div className="flex flex-wrap gap-2 p-4">
                <Button type="button" className="h-9" disabled={saving || rows.length === 0 || overBy > 0} onClick={load}>
                  {saving ? "Cargando…" : `Cargar ${rows.length} ${rows.length === 1 ? "línea" : "líneas"}`}
                </Button>
                <Button type="button" variant="outline" className="h-9" disabled={saving || grid.length === 0} onClick={() => setStep("map")}>
                  Cambiar columnas
                </Button>
                <Button type="button" variant="outline" className="h-9" disabled={saving} onClick={reset}>
                  Otro archivo
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar la carga masiva?</AlertDialogTitle>
            <AlertDialogDescription>
              Se pierde lo que se leyó de la captura y lo que hayas corregido. Las líneas no se han cargado a la lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmClose(false);
                setOpen(false);
                reset();
              }}
            >
              Sí, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
