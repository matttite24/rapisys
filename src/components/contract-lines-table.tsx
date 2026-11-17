"use client";

import { PRODUCT_COL, ProductCell } from "@/components/product-cell";
import { ConfirmTap } from "@/components/confirm-tap";
import { cn } from "@/lib/utils";
import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { unitLabel } from "@/lib/units";
import { LineView, TD, TEMP_PREFIX, TH } from "@/components/contract-lines-model";

export function LinesTable({
  lines,
  editingId,
  canEdit,
  onEdit,
  onRemove,
}: {
  lines: LineView[];
  editingId: string | null;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${TH} w-px text-right`}>N.º</TableHead>
            <TableHead className={`${TH} ${PRODUCT_COL}`}>Producto</TableHead>
            <TableHead className={`${TH} w-28 text-right`}>Cantidad</TableHead>
            <TableHead className={`${TH} w-32 text-right`}>Valor unit. ref.</TableHead>
            <TableHead className={`${TH} w-32 text-right`}>Total ref.</TableHead>
            <TableHead className={`${TH} w-px`}><span className="sr-only">Acciones</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <LineRow
              key={l.id}
              line={l}
              n={l.n}
              duplicateOf={l.dupOf}
              editing={l.id === editingId}
              canEdit={canEdit}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </TableBody>
      </Table>
  );
}

export function LineRow({
  line: l,
  n,
  duplicateOf,
  editing,
  canEdit,
  onEdit,
  onRemove,
}: {
  line: LineView;
  n: number;
  duplicateOf?: number;
  editing: boolean;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // Línea enviada y aún sin confirmar por el servidor.
  const saving = l.id.startsWith(TEMP_PREFIX);

  return (
    <TableRow
      className={cn(
        "last:border-b-0",
        saving && "opacity-60",
        editing && "bg-muted",
      )}
    >
      <TableCell
        className={cn(TD, "num text-right", duplicateOf ? "bg-destructive/10 font-medium text-destructive" : "text-muted-foreground")}
        title={duplicateOf ? `Repetido: igual a la línea ${duplicateOf}` : undefined}
      >
        {n}
        {duplicateOf && <span className="sr-only">. Repetido: igual a la línea {duplicateOf}</span>}
      </TableCell>
      <TableCell className={`${TD} break-words whitespace-normal`}>
        <ProductCell description={l.description} partNumber={l.partNumber} internalCode={l.internalCode} reference={l.reference} />
      </TableCell>
      <TableCell className={`${TD} num whitespace-nowrap text-right`}>
        {l.quantity} <span className="font-sans text-xs text-muted-foreground">{unitLabel(l.unit)}</span>
      </TableCell>
      <TableCell className={`${TD} num whitespace-nowrap text-right`}>{l.referencePriceCents === null || l.quantity <= 0 ? "—" : formatCents(Math.round(l.referencePriceCents / l.quantity))}</TableCell>
      <TableCell className={`${TD} num whitespace-nowrap text-right`}>{l.referencePriceCents === null ? "—" : formatCents(l.referencePriceCents)}</TableCell>
      <TableCell className={cn(TD, "p-1 whitespace-nowrap")}>
        {saving ? null : (
          <span className="flex gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Editar la línea ${n}`}
                aria-pressed={editing}
                onClick={() => onEdit(l.id)}
              >
                <HugeiconsIcon icon={Edit02Icon} className="size-4" />
              </Button>
            )}
            <ConfirmTap
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
              aria-label={`Quitar la línea ${n} del proceso`}
              hint="Toca otra vez para quitar"
              onConfirm={() => onRemove(l.id)}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </ConfirmTap>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
