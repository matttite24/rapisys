"use client";

import { useRef, useState } from "react";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import type { SourceOption } from "@/components/files-board";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { finishUpload, prepareUpload } from "@/lib/file-actions";
import { FILE_ACCEPT, FILES_BUCKET, MAX_FILE_BYTES, formatBytes, resolveMime, type FileSource } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Cargar uno o varios archivos al contrato, a la vez, indicando a qué pertenecen. La subida va directo a Storage con una URL
// firmada que prepara el servidor; después se registra cada archivo.
export function FilesUploadDialog({
  org,
  contractId,
  purchases = [],
  expenses = [],
  fixed,
  onUploaded,
  open,
  onOpenChange,
}: {
  org: string;
  contractId: string;
  purchases?: SourceOption[];
  expenses?: SourceOption[];
  // Si se abre desde una compra o un gasto, el archivo pertenece a ese y no se elige.
  fixed?: { source: "purchase" | "expense"; id: string; label: string };
  onUploaded?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [source, setSource] = useState<FileSource>(fixed?.source ?? "contract");
  const [sourceId, setSourceId] = useState(fixed?.id ?? "");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const uploading = progress !== null;

  function reset() {
    setPicked([]);
    setSource(fixed?.source ?? "contract");
    setSourceId(fixed?.id ?? "");
    setError(undefined);
    setProgress(null);
  }

  function add(list: FileList | File[]) {
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) return setError(`«${f.name}» supera los 15 MB.`);
      if (!resolveMime(f.name, f.type)) return setError(`«${f.name}» no es un tipo permitido (PDF, imágenes, Office, CSV o XML).`);
      next.push(f);
    }
    setError(undefined);
    setPicked((prev) => [...prev, ...next]);
  }

  async function submit() {
    if (uploading || picked.length === 0) return;
    if (source !== "contract" && !sourceId) return setError(source === "purchase" ? "Elige la compra." : "Elige el gasto.");
    setError(undefined);
    setProgress({ done: 0, total: picked.length });
    const supabase = createClient();
    let ok = 0;
    for (const f of picked) {
      const meta = { name: f.name, size: f.size, type: f.type, source, sourceId: source === "contract" ? null : sourceId };
      try {
        const prep = await prepareUpload(org, contractId, meta);
        if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "No se pudo preparar la subida.");
        const { error: upErr } = await supabase.storage.from(FILES_BUCKET).uploadToSignedUrl(prep.path, prep.token, f, { contentType: prep.mime });
        if (upErr) throw new Error("No se pudo subir el archivo. Revisa tu conexión.");
        const fin = await finishUpload(org, contractId, { ...meta, path: prep.path });
        if (fin.error) throw new Error(fin.error);
        ok++;
        setProgress({ done: ok, total: picked.length });
      } catch (e) {
        setProgress(null);
        setPicked((prev) => prev.slice(ok)); // quedan solo los que faltan
        if (ok > 0) {
          toast.success(`${ok} ${ok === 1 ? "archivo cargado" : "archivos cargados"}.`);
          onUploaded?.();
        }
        return setError(`«${f.name}»: ${e instanceof Error ? e.message : "no se pudo cargar."}`);
      }
    }
    toast.success(`${ok} ${ok === 1 ? "archivo cargado" : "archivos cargados"}.`);
    reset();
    onUploaded?.();
    onOpenChange(false);
  }

  const options = source === "purchase" ? purchases : expenses;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (uploading) return; // no se cierra a mitad de una subida
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-6">
          <DialogTitle>Cargar archivos</DialogTitle>
          <DialogDescription>PDF, imágenes, Office, CSV o XML, de hasta 15 MB cada uno.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploading) add(e.dataTransfer.files);
            }}
            className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors", dragging ? "border-foreground bg-muted" : "bg-muted/40")}
          >
            <HugeiconsIcon icon={Upload01Icon} aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Arrastra los archivos aquí</p>
            <Button type="button" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
              Elegir archivos
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="sr-only"
              aria-label="Archivos a cargar"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {picked.length > 0 && (
            <ul aria-label="Archivos elegidos" className="divide-y border">
              {picked.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    {!uploading && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}>
                        Quitar
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {fixed ? (
            <p className="text-sm text-muted-foreground">Se adjunta a: <span className="text-foreground">{fixed.label}</span></p>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="file_source" label="Pertenece a">
              {(a11y) => (
                <NativeSelect {...a11y} className="w-full" value={source} disabled={uploading} onChange={(e) => { setSource(e.target.value as FileSource); setSourceId(""); }}>
                  <option value="contract">El contrato</option>
                  <option value="purchase">Una compra</option>
                  <option value="expense">Un gasto</option>
                </NativeSelect>
              )}
            </FormField>
            {source !== "contract" && (
              <FormField name="file_source_id" label={source === "purchase" ? "Compra" : "Gasto"}>
                {(a11y) => (
                  <NativeSelect {...a11y} className="w-full" value={sourceId} disabled={uploading} onChange={(e) => setSourceId(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}
          </div>
          )}
          {!fixed && source !== "contract" && options.length === 0 && (
            <p className="text-xs text-muted-foreground">{source === "purchase" ? "Este contrato aún no tiene compras." : "Este contrato aún no tiene gastos."}</p>
          )}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button type="button" variant="brand" className="h-10" disabled={uploading || picked.length === 0} onClick={() => void submit()}>
            {uploading ? `Subiendo ${progress.done + 1} de ${progress.total}…` : picked.length > 1 ? `Cargar ${picked.length} archivos` : "Cargar"}
          </Button>
          <Button type="button" variant="outline" className="h-10" disabled={uploading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
