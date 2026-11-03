"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Cancel01Icon, FileUploadIcon, ImageUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addLines } from "@/lib/contract-actions";
import { groupWords, parseTable, type OcrWord } from "@/lib/ocr-table";
import { UNITS } from "@/lib/units";
import { cn } from "@/lib/utils";

type Step = "start" | "reading" | "review";

type Row = {
  id: number;
  part: string;
  description: string;
  quantity: string;
  unit: string;
  cpc: string;
  raw: string;
  review: boolean;
};

// Agranda y pasa a grises la captura: el OCR lee mejor letras de más de ~30 px.
async function prepare(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 2000 ? Math.min(3, 2000 / bmp.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.filter = "grayscale(1) contrast(1.3)"; // si el navegador no lo soporta, se ignora
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png"));
}

// Lee la imagen con Tesseract, en el navegador: la captura no sale de tu equipo. Los datos
// de idioma se descargan una vez (unos MB) la primera vez que se usa.
async function readImage(file: Blob, onProgress: (p: number) => void): Promise<OcrWord[]> {
  const image = await prepare(file);
  const mod = await import("tesseract.js");
  const T = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const worker = await T.createWorker(["eng", "spa"], 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words)
            words.push({ text: w.text, confidence: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
    return words;
  } finally {
    await worker.terminate();
  }
}

// Carga masiva de la lista abierta: captura → lectura (OCR) → revisión editable → carga.
export function BulkImport({
  org,
  contractId,
  listId,
  listName,
}: {
  org: string;
  contractId: string;
  listId: string;
  listName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("start");
  const [imageUrl, setImageUrl] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string>();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
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
    setError(undefined);
    setRowErrors({});
    setSaving(false);
  }

  async function start(file: Blob) {
    setError(undefined);
    setImageUrl(URL.createObjectURL(file));
    setProgress(0);
    setStep("reading");
    try {
      const words = await readImage(file, setProgress);
      const parsed = parseTable(groupWords(words));
      setSkipped(parsed.skipped);
      setRows(
        parsed.rows.map((r) => ({
          id: nextId.current++,
          part: r.part,
          description: r.description,
          quantity: r.quantity,
          unit: "unit",
          cpc: r.cpc,
          raw: r.raw,
          review: r.review,
        })),
      );
      setStep("review");
    } catch {
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
  function patch(id: number, change: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change, review: change.review ?? false } : r)));
  }

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
        rows.map((r) => ({ partNumber: r.part, description: r.description, quantity: r.quantity, unit: r.unit, cpc: r.cpc })),
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

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={FileUploadIcon} className="size-4" />
        Carga masiva
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-6xl">
          <DialogHeader className="border-b p-6 pr-16">
            <DialogTitle>Carga masiva en «{listName}»</DialogTitle>
            <DialogDescription>
              {step === "review"
                ? "Revisa lo que leyó la captura y corrige lo que haga falta antes de cargar."
                : "Pega una captura de la tabla del contrato. Se lee en tu navegador: la imagen no sale de tu equipo."}
            </DialogDescription>
          </DialogHeader>

          {step === "start" && (
            <div className="p-6">
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
                  dragging ? "border-brand bg-brand/5" : "bg-muted/40",
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
                <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">La primera vez tarda más: descarga el idioma de lectura.</p>
            </div>
          )}

          {step === "review" && (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-6 py-3 font-mono text-xs uppercase tracking-[0.08em]">
                <span>{rows.length} {rows.length === 1 ? "fila" : "filas"} leídas</span>
                <span className={toReview ? "text-foreground" : "text-muted-foreground"}>{toReview} para revisar</span>
                {skipped > 0 && <span className="text-muted-foreground">{skipped} renglones descartados</span>}
              </div>
              <div className="grid lg:grid-cols-[18rem_1fr]">
                <div className="border-b p-4 lg:border-r lg:border-b-0">
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="Captura original" className="max-h-64 w-full border object-contain lg:max-h-[28rem]" />
                  )}
                  <p className="pt-2 text-xs text-muted-foreground">Compara con la captura: los números de parte son lo más fácil de leer mal.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left font-mono text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
                        <th className="w-px px-3 py-2 text-right">N.º</th>
                        <th className="px-2 py-2">Part. num.</th>
                        <th className="px-2 py-2">Descripción</th>
                        <th className="px-2 py-2">Cantidad</th>
                        <th className="px-2 py-2">Unidad</th>
                        <th className="px-2 py-2">CPC</th>
                        <th className="w-px px-2 py-2"><span className="sr-only">Quitar</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-muted-foreground">
                            No se reconoció ninguna fila. Prueba con una captura más grande o más nítida.
                          </td>
                        </tr>
                      )}
                      {rows.map((r, i) => {
                        const err = (f: string) => rowErrors[`${i}.${f}`];
                        return (
                          <tr key={r.id} className={cn("border-b align-top last:border-b-0", r.review && "bg-amber-500/10")}>
                            <td className="num px-3 py-2 text-right text-muted-foreground">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <Input aria-label={`Número de parte, fila ${i + 1}`} aria-invalid={!!err("part_number") || undefined} className="h-8 font-mono" value={r.part} onChange={(e) => patch(r.id, { part: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input aria-label={`Descripción, fila ${i + 1}`} aria-invalid={!!err("description") || undefined} className="h-8" value={r.description} onChange={(e) => patch(r.id, { description: e.target.value })} />
                              {r.review && r.raw && <p className="pt-1 font-mono text-[0.6875rem] text-muted-foreground">Leído: {r.raw}</p>}
                              {(err("description") || err("part_number")) && <p className="pt-1 text-xs text-destructive">{err("description") ?? err("part_number")}</p>}
                            </td>
                            <td className="w-28 px-2 py-1.5">
                              <Input aria-label={`Cantidad, fila ${i + 1}`} aria-invalid={!!err("quantity") || undefined} inputMode="decimal" className="h-8 font-mono" value={r.quantity} onChange={(e) => patch(r.id, { quantity: e.target.value })} />
                              {err("quantity") && <p className="pt-1 text-xs text-destructive">{err("quantity")}</p>}
                            </td>
                            <td className="w-36 px-2 py-1.5">
                              <NativeSelect aria-label={`Unidad, fila ${i + 1}`} className="h-8 w-full" value={r.unit} onChange={(e) => patch(r.id, { unit: e.target.value })}>
                                {Object.entries(UNITS).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </NativeSelect>
                            </td>
                            <td className="w-36 px-2 py-1.5">
                              <Input aria-label={`CPC, fila ${i + 1}`} aria-invalid={!!err("cpc") || undefined} className="h-8 font-mono" value={r.cpc} onChange={(e) => patch(r.id, { cpc: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5">
                              <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Quitar la fila ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {error && <div className="border-t p-4"><FieldError>{error}</FieldError></div>}
              <div className="flex flex-wrap gap-2 border-t p-4">
                <Button type="button" className="h-10" disabled={saving || rows.length === 0} onClick={load}>
                  {saving ? "Cargando…" : `Cargar ${rows.length} ${rows.length === 1 ? "línea" : "líneas"}`}
                </Button>
                <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={reset}>
                  Otra captura
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
