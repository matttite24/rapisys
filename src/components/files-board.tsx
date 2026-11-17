"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Delete02Icon,
  Download01Icon,
  File01Icon,
  Image01Icon,
  PdfIcon,
  Upload01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { toast } from "sonner";
import { ConfirmTap } from "@/components/confirm-tap";
import { TAB, TABS_ROW, TabCount } from "@/components/count-tabs";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { FilesUploadDialog } from "@/components/files-upload-dialog";
import { HeaderAction } from "@/components/header-action";
import { Pager } from "@/components/pager";
import { PageFigures } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteFile, getFileUrl } from "@/lib/file-actions";
import { fileKind, formatBytes, SOURCE_LABEL, type FileKind, type FileSource } from "@/lib/files";
import { formatIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type FileRow = { id: string; name: string; source: FileSource; sourceLabel?: string; mime: string; size: number; createdAt: string; thumbUrl?: string };

const KIND_ICON: Record<FileKind, IconSvgElement> = { pdf: PdfIcon, image: Image01Icon, sheet: File01Icon, doc: File01Icon, xml: File01Icon, other: File01Icon };
// `origin` es el valor de ?origen= en la dirección ("" = todos).
const TABS: { key: "all" | FileSource; label: string; origin: string }[] = [
  { key: "all", label: "Todos", origin: "" },
  { key: "contract", label: "Contrato", origin: "contrato" },
  { key: "purchase", label: "Compras", origin: "compras" },
  { key: "expense", label: "Gastos", origin: "gastos" },
  { key: "delivery", label: "Entregas", origin: "entregas" },
];

// Todos los archivos del proceso en un solo lugar: los propios y los de sus compras y gastos.
export function FilesBoard({
  org,
  contractId,
  files,
  counts,
  origin,
  page,
  total,
  bytes,
  pageSize,
}: {
  org: string;
  contractId: string;
  files: FileRow[];
  counts: Record<"all" | FileSource, number>;
  origin: string;
  page: number;
  total: number;
  bytes: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // El origen viaja en la dirección: cambiarlo pide al servidor solo esa página de archivos.
  const tab = TABS.find((t) => t.origin === origin)?.key ?? "all";
  function select(next: string) {
    startTransition(() => router.replace(next ? `${pathname}?origen=${next}` : pathname, { scroll: false }));
  }
  const shown = files;
  const labelOf = (f: FileRow) => (f.source === "contract" ? "Contrato" : `${SOURCE_LABEL[f.source]} · ${f.sourceLabel ?? ""}`);

  async function open(f: FileRow, mode: "view" | "download") {
    setBusyId(f.id);
    // La pestaña se abre en el clic (antes de esperar) para que el navegador no la bloquee.
    const tabRef = mode === "view" ? window.open("", "_blank") : null;
    const res = await getFileUrl(org, contractId, f.id, mode);
    setBusyId(null);
    if (res.error || !res.url) {
      tabRef?.close();
      return void toast.error(res.error ?? "No se pudo abrir el archivo.");
    }
    if (tabRef) tabRef.location.href = res.url;
    else window.location.assign(res.url);
  }

  async function remove(f: FileRow) {
    setBusyId(f.id);
    const res = await deleteFile(org, contractId, f.id);
    setBusyId(null);
    if (res.error) return void toast.error(res.error);
    toast.success("Archivo eliminado.");
  }

  return (
    <PageSection className={cn("p-0 transition-opacity", pending && "opacity-60")}>
      <h1 className="sr-only">Archivos del proceso</h1>
      <HeaderAction icon={Upload01Icon} label="Cargar" onClick={() => setUploadOpen(true)} />
      <PageFigures figures={[{ label: "", value: String(counts.all), note: `${counts.all === 1 ? "archivo" : "archivos"} · ${formatBytes(bytes)}` }]} />
      <FilesUploadDialog org={org} contractId={contractId} open={uploadOpen} onOpenChange={setUploadOpen} />

      <nav aria-label="Origen de los archivos" className={TABS_ROW}>
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => select(t.origin)} className={TAB(tab === t.key)}>
            {t.label} <TabCount n={counts[t.key]} active={tab === t.key} />
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          fill
          image={counts.all === 0 ? "file" : NO_RESULTS_IMAGE}
          action={counts.all === 0 && <Button variant="brand" onClick={() => setUploadOpen(true)}>Cargar archivos</Button>}
        >
          {counts.all === 0 ? "Aún no hay archivos. Carga facturas, notas de entrega, fotos o comprobantes." : "No hay archivos de este origen."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Archivo</TableHead>
              <TableHead>Pertenece a</TableHead>
              <TableHead className="text-right">Tamaño</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((f) => {
              const kind = fileKind(f.mime);
              const viewable = kind === "pdf" || kind === "image";
              return (
                <TableRow key={f.id}>
                  <TableCell className="max-w-0 min-w-56">
                    <span className="flex items-center gap-3">
                      {f.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.thumbUrl} alt="" loading="lazy" className="size-9 shrink-0 rounded-sm bg-muted object-cover" />
                      ) : (
                        <HugeiconsIcon icon={KIND_ICON[kind]} aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium" title={f.name}>
                        {f.name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0 min-w-40 truncate text-muted-foreground" title={labelOf(f)}>
                    {labelOf(f)}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{formatBytes(f.size)}</TableCell>
                  <TableCell className="num whitespace-nowrap">{formatIso(f.createdAt.slice(0, 10))}</TableCell>
                  <TableCell className="p-1 whitespace-nowrap">
                    <span className="flex justify-end gap-1">
                      {viewable && (
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Ver ${f.name}`} title="Ver" disabled={busyId === f.id} onClick={() => void open(f, "view")}>
                          <HugeiconsIcon icon={ViewIcon} className="size-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Descargar ${f.name}`} title="Descargar" disabled={busyId === f.id} onClick={() => void open(f, "download")}>
                        <HugeiconsIcon icon={Download01Icon} className="size-4" />
                      </Button>
                      <ConfirmTap
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                        aria-label={`Eliminar ${f.name}`}
                        disabled={busyId === f.id}
                        hint="Toca otra vez para eliminar"
                        onConfirm={() => void remove(f)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                      </ConfirmTap>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pager basePath={pathname} page={page} total={total} size={pageSize} params={origin ? { origen: origin } : {}} />
    </PageSection>
  );
}
