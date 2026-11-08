"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fillQuantities, tableFrom, withOcr } from "@/lib/ocr-engine";
import { cn } from "@/lib/utils";

type Step = "start" | "reading" | "review";

type Row = {
  id: number;
  part: string;
  description: string;
  quantity: string;
  unit: string;
  // Precio referencial unitario (sin IVA): se escribe a mano al revisar.
  price: string;
  raw: string;
  review: boolean;
};

const REVIEW_PAGE = 100;

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
        {r.review && r.raw && <p className="pt-1 font-mono text-[0.6875rem] text-muted-foreground">Leído: {r.raw}</p>}
        {(err("description") || err("part_number")) && <p className="pt-1 text-xs text-destructive">{err("description") ?? err("part_number")}</p>}
      </td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Cantidad, fila ${i + 1}`} aria-invalid={!!err("quantity") || undefined} inputMode="decimal" className="h-8 font-mono" value={r.quantity} onChange={(e) => onPatch(r.id, { quantity: e.target.value })} />
        {err("quantity") && <p className="pt-1 text-xs text-destructive">{err("quantity")}</p>}
      </td>
      <td className="px-2 py-1.5">
        <Input aria-label={`Precio ref., fila ${i + 1}`} aria-invalid={!!err("reference_price") || undefined} inputMode="decimal" placeholder="0,00" className="h-8 text-right font-mono" value={r.price} onChange={(e) => onPatch(r.id, { price: e.target.value })} />
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
  const nextId = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("start");
    setImageUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return undefined;
    });
    setProgress(0);
    setRows([]);
    setSkipped(0);
    setRawText("");
    setError(undefined);
    setRowErrors({});
    setSaving(false);
    setOnlyDup(false);
    setReviewPage(0);
  }

  async function start(file: Blob) {
    setError(undefined);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setProgress(0);
    setStep("reading");
    try {
      const { parsed, raw } = await withOcr(file, setProgress, async (ocr) => {
        const reading = await ocr.read((r) => tableFrom(r).rows.length > 0);
        const parsed = tableFrom(reading);
        await fillQuantities(parsed.rows, reading.words, ocr);
        return { parsed, raw: reading.lines.map((l) => l.text.trim()).filter(Boolean).join("\n") };
      });
      setRawText(raw);
      setSkipped(parsed.skipped);
      setRows(
        parsed.rows.map((r) => ({
          id: nextId.current++,
          part: r.part,
          description: r.description,
          quantity: r.quantity,
          unit: "unit",
          price: "",
          raw: r.raw,
          review: r.review,
        })),
      );
      setStep("review");
    } catch (e) {
      console.error("OCR", e);
      setError("No se pudo leer la imagen. Revisa tu conexión (la primera vez descarga el idioma) e inténtalo de nuevo.");
      setStep("start");
    }
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
              Pega una captura de la tabla del contrato, revisa lo que se leyó y cárgalo a la lista.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">

          {step === "start" && (
            <div className="p-6">
              <p className="pb-4 text-sm text-muted-foreground">
                Pega una captura de la tabla del contrato. Se lee en tu navegador: la imagen no sale de tu equipo.
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
                  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
                  if (file) void start(file);
                }}
                className={cn(
                  "flex flex-col items-center gap-4 border border-dashed px-6 py-16 text-center",
                  dragging ? "border-primary bg-primary/5" : "bg-muted/40",
                )}
              >
                <HugeiconsIcon icon={ImageUploadIcon} className="size-10 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Pega la captura con Ctrl + V</p>
                  <p className="text-sm text-muted-foreground">o arrástrala aquí, o elige un archivo de imagen</p>
                </div>
                <Button type="button" variant="outline" className="h-10" onClick={() => fileInput.current?.click()}>
                  Elegir imagen
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  aria-label="Elegir la imagen de la captura"
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

          {step === "reading" && (
            <div className="flex flex-col items-center gap-4 p-16 text-center">
              <p className="font-medium">Leyendo la imagen…</p>
              <div className="h-1.5 w-full max-w-sm bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">La primera vez tarda más: descarga el idioma de lectura.</p>
            </div>
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
                      <dd className="num text-2xl">{rows.length}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Por revisar</dt>
                      <dd className={cn("num text-2xl", toReview > 0 && "text-destructive")}>{toReview}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Duplicados</dt>
                      <dd className={cn("num text-2xl", dupCount > 0 && "text-destructive")}>{dupCount}</dd>
                    </div>
                    <div>
                      <dt className="caps text-muted-foreground">Descartados</dt>
                      <dd className="num text-2xl text-muted-foreground">{skipped}</dd>
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
                      <th className="w-44 px-2 py-2 text-right">Precio ref.</th>
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
                    {pageIdx.map((i) => (
                      <ReviewRow
                        key={rows[i].id}
                        row={rows[i]}
                        index={i}
                        dupKind={dups[i]?.kind}
                        dupRef={dups[i]?.ref}
                        errors={rowErrors}
                        onPatch={patch}
                        onRemove={removeRow}
                      />
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
                <Button type="button" className="h-10" disabled={saving || rows.length === 0 || overBy > 0} onClick={load}>
                  {saving ? "Cargando…" : `Cargar ${rows.length} ${rows.length === 1 ? "línea" : "líneas"}`}
                </Button>
                <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={reset}>
                  Otra captura
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
