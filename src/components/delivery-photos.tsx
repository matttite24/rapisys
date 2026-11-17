"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera01Icon, Delete02Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { ConfirmTap } from "@/components/confirm-tap";
import { deleteFile, getFileUrl } from "@/lib/file-actions";
import { finishDeliveryPhoto, prepareDeliveryPhoto } from "@/lib/delivery-photo-actions";
import { FILES_BUCKET, MAX_FILE_BYTES } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { makeThumbnail } from "@/lib/thumbnail";

export type DeliveryPhoto = { id: string; name: string; thumbUrl?: string; createdAt: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Registro fotográfico de la entrega: se suben fotos (también desde la cámara del celular) y se ven en una cuadrícula.
export function DeliveryPhotos({
  org, contractId, deliveryId, photos, canEdit,
}: {
  org: string; contractId: string; deliveryId: string; photos: DeliveryPhoto[]; canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length || progress) return;
    const supabase = createClient();
    setProgress({ done: 0, total: list.length });
    let ok = 0;
    for (const original of list) {
      const f = await compressImage(original);
      try {
        if (f.size > MAX_FILE_BYTES) throw new Error("supera los 15 MB");
        const meta = { name: f.name, size: f.size, type: f.type };
        const prep = await prepareDeliveryPhoto(org, contractId, deliveryId, meta);
        if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "no se pudo preparar la subida");
        const up = await supabase.storage.from(FILES_BUCKET).uploadToSignedUrl(prep.path, prep.token, f, { contentType: prep.mime });
        if (up.error) throw new Error("no se pudo subir, revisa tu conexión");
        let thumbPath: string | undefined;
        if (prep.thumbPath && prep.thumbToken) {
          const blob = await makeThumbnail(f, 720);
          if (blob) {
            const t = await supabase.storage.from(FILES_BUCKET).uploadToSignedUrl(prep.thumbPath, prep.thumbToken, blob, { contentType: "image/webp" });
            if (!t.error) thumbPath = prep.thumbPath;
          }
        }
        const fin = await finishDeliveryPhoto(org, contractId, deliveryId, { ...meta, path: prep.path, thumbPath });
        if (fin.error) throw new Error(fin.error);
        ok++;
        setProgress({ done: ok, total: list.length });
      } catch (e) {
        toast.error(`«${original.name}»: ${e instanceof Error ? e.message : "no se pudo cargar"}.`);
      }
    }
    setProgress(null);
    if (ok) {
      toast.success(`${ok} ${ok === 1 ? "foto agregada" : "fotos agregadas"}.`);
      router.refresh();
    }
  }

  async function open(id: string) {
    const res = await getFileUrl(org, contractId, id, "view");
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else toast.error(res.error ?? "No se pudo abrir la foto.");
  }

  async function remove(id: string) {
    const res = await deleteFile(org, contractId, id);
    if (res.error) return toast.error(res.error);
    toast.success("Foto eliminada.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {canEdit && (
        <input ref={input} type="file" accept="image/*" multiple capture="environment" className="sr-only" tabIndex={-1} aria-label="Elegir fotos de la entrega"
          onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      )}
      {canEdit && <p className="text-sm text-muted-foreground">Registro fotográfico de la entrega. Desde el celular puedes usar la cámara.</p>}
      {!canEdit && photos.length === 0 && <p className="text-sm text-muted-foreground">No hay fotos de esta entrega.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        {canEdit && (
          <li>
            <button
              type="button"
              disabled={!!progress}
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 border border-dashed bg-muted/40 px-1 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent/50 hover:text-foreground disabled:opacity-60"
            >
              <HugeiconsIcon icon={progress ? ImageAdd01Icon : Camera01Icon} className="size-5" />
              {progress ? `Subiendo ${progress.done + 1}/${progress.total}…` : "Añadir foto"}
            </button>
          </li>
        )}
        {photos.map((p) => (
          <li key={p.id} className="group relative aspect-square overflow-hidden border bg-muted">
            <button type="button" aria-label={`Ver la foto ${p.name}`} onClick={() => void open(p.id)} className="block size-full">
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center px-1 text-center text-2xs text-muted-foreground">{p.name}</span>
              )}
            </button>
            <span className="num absolute bottom-0 left-0 bg-background/90 px-1 font-mono text-2xs">{when(p.createdAt)}</span>
            {canEdit && (
              <ConfirmTap
                variant="secondary"
                size="icon"
                className="absolute top-0.5 right-0.5 size-6"
                aria-label={`Eliminar la foto ${p.name}`}
                hint="Toca otra vez para eliminar"
                onConfirm={() => void remove(p.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              </ConfirmTap>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
