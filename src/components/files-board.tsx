"use client";

import { useState } from "react";
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
import { PageFigures } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteFile, getFileUrl } from "@/lib/file-actions";
import { fileKind, formatBytes, SOURCE_LABEL, type FileKind, type FileSource } from "@/lib/files";
import { formatIso } from "@/lib/dates";

export type FileRow = { id: string; name: string; source: FileSource; sourceId: string | null; mime: string; size: number; createdAt: string };
export type SourceOption = { id: string; label: string };

const KIND_ICON: Record<FileKind, IconSvgElement> = { pdf: PdfIcon, image: Image01Icon, sheet: File01Icon, doc: File01Icon, xml: File01Icon, other: File01Icon };
const TABS: { key: "all" | FileSource; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "contract", label: "Contrato" },
  { key: "purchase", label: "Compras" },
  { key: "expense", label: "Gastos" },
];

// Todos los archivos del contrato en un solo lugar: los propios y los de sus compras y gastos.
export function FilesBoard({
  org,
  contractId,
  files,
  purchases,
  expenses,
}: {
  org: string;
  contractId: string;
  files: FileRow[];
  purchases: SourceOption[];
  expenses: SourceOption[];
}) {
  const [tab, setTab] = useState<"all" | FileSource>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts: Record<"all" | FileSource, number> = {
    all: files.length,
    contract: files.filter((f) => f.source === "contract").length,
    purchase: files.filter((f) => f.source === "purchase").length,
    expense: files.filter((f) => f.source === "expense").length,
  };
  const shown = tab === "all" ? files : files.filter((f) => f.source === tab);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const labelOf = (f: FileRow) => {
    if (f.source === "contract") return "Contrato";
    const list = f.source === "purchase" ? purchases : expenses;
    const name = list.find((o) => o.id === f.sourceId)?.label ?? "(eliminado)";
    return `${SOURCE_LABEL[f.source]} · ${name}`;
  };

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
    <PageSection className="p-0">
      <h1 className="sr-only">Archivos del contrato</h1>
      <HeaderAction icon={Upload01Icon} label="Cargar" onClick={() => setUploadOpen(true)} />
      <PageFigures figures={[{ label: "", value: String(files.length), note: `${files.length === 1 ? "archivo" : "archivos"} · ${formatBytes(totalBytes)}` }]} />
      <FilesUploadDialog org={org} contractId={contractId} purchases={purchases} expenses={expenses} open={uploadOpen} onOpenChange={setUploadOpen} />

      <nav aria-label="Origen de los archivos" className={TABS_ROW}>
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)} className={TAB(tab === t.key)}>
            {t.label} <TabCount n={counts[t.key]} active={tab === t.key} />
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          fill
          image={files.length === 0 ? "file" : NO_RESULTS_IMAGE}
          action={files.length === 0 && <Button variant="brand" onClick={() => setUploadOpen(true)}>Cargar archivos</Button>}
        >
          {files.length === 0 ? "Aún no hay archivos. Carga facturas, notas de entrega, fotos o comprobantes." : "No hay archivos de este origen."}
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
                      <HugeiconsIcon icon={KIND_ICON[kind]} aria-hidden className="size-5 shrink-0 text-muted-foreground" />
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
    </PageSection>
  );
}
