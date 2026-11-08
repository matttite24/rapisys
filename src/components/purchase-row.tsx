"use client";

import { useState } from "react";
import { ArrowLeft01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NativeSelect } from "@/components/ui/native-select";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import { type ItemOption } from "@/lib/purchase-actions";
import { IVA_OPTIONS, ROW_GRID, Row, rowSubtotal } from "@/components/purchase-form-model";
import { ItemPicker } from "@/components/purchase-pickers";

export function PurchaseRow({
  n,
  row,
  org,
  canRemove,
  onPatch,
  onPick,
  onRemove,
}: {
  n: number;
  row: Row;
  org: string;
  canRemove: boolean;
  onPatch: (change: Partial<Row>) => void;
  onPick: (item: ItemOption) => void;
  onRemove: () => void;
}) {
  const hint = "caps text-muted-foreground lg:hidden";
  const [searching, setSearching] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const subtotal = rowSubtotal(row);
  return (
    <li data-row-key={row.key} className="relative px-4 py-3 lg:py-1.5">
      <div className={ROW_GRID}>
        <span className="num text-muted-foreground max-lg:hidden">{n}</span>
        {row.item ? (
          <span className="truncate font-mono text-xs text-muted-foreground max-sm:col-span-2 sm:max-lg:col-span-2" title={row.code}>
            {row.code || "—"}
          </span>
        ) : (
          <Input
            data-col="code"
            aria-label={`Código de la línea ${n} (número de parte)`}
            className="h-9 font-mono max-sm:col-span-2 sm:max-lg:col-span-2 lg:h-8"
            autoComplete="off"
            maxLength={60}
            placeholder="Código"
            value={row.code}
            onChange={(e) => onPatch({ code: e.target.value })}
          />
        )}
        <div className="min-w-0 max-sm:col-span-2 sm:max-lg:col-span-5">
        <div className="flex min-w-0 items-center gap-2">
        {row.item || searching ? (
          <ItemPicker
            org={org}
            item={row.item}
            initialQuery={row.name}
            className="min-w-0 flex-1"
            onPick={(item) => {
              setSearching(false);
              onPick(item);
            }}
            onRequestChange={() => setConfirmChange(true)}
          />
        ) : (
          <Input
            data-col="name"
            aria-label={`Nombre del producto de la línea ${n}`}
            className="h-9 min-w-0 flex-1 max-sm:col-span-2 sm:max-lg:col-span-5 lg:h-8"
            autoComplete="off"
            maxLength={300}
            placeholder="Nombre del producto"
            value={row.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        )}
        {!row.item && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={searching ? "Volver a editar descripción" : "Buscar producto"}
            title={searching ? "Volver a editar descripción" : "Buscar producto"}
            onClick={() => setSearching((v) => !v)}
          >
            <HugeiconsIcon icon={searching ? ArrowLeft01Icon : Search01Icon} className="size-4" />
          </Button>
        )}
        </div>
        </div>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={hint}>Cantidad</span>
          <NumericInput
            kind="decimal"
            data-col="qty"
            aria-label={`Cantidad de la línea ${n}`}
            className="h-9 font-mono lg:h-8"
            value={row.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value, total: undefined })}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={hint}>P. unitario</span>
          <MoneyInput
            data-col="cost"
            aria-label={`Costo unitario sin IVA de la línea ${n}`}
            className="h-9 lg:h-8"
            name={`cost-${row.key}`}
            value={row.cost}
            onChange={(cost) => onPatch({ cost, total: undefined })}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={hint}>IVA %</span>
          <NativeSelect
            data-col="vat"
            aria-label={`IVA de la línea ${n}`}
            className="h-9 font-mono lg:h-8"
            value={row.vat}
            onChange={(e) => onPatch({ vat: e.target.value })}
          >
            {(IVA_OPTIONS.includes(row.vat) ? IVA_OPTIONS : [row.vat, ...IVA_OPTIONS]).map((v) => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={hint}>Subtotal</span>
          <span
            className="num flex h-9 items-center justify-end rounded-lg border border-input bg-muted/40 px-2 font-mono text-sm lg:h-8"
            aria-label={`Subtotal sin IVA de la línea ${n}`}
            aria-readonly="true"
          >
            {subtotal === null ? "—" : formatCents(subtotal)}
          </span>
        </label>
        <div className="flex min-w-0 items-center gap-2 max-sm:col-span-2 max-lg:border-t max-lg:border-border max-lg:pt-2 sm:max-lg:col-span-2 sm:max-lg:justify-end sm:max-lg:border-t-0 sm:max-lg:pt-0">
          {row.item ? (
            row.verified ? (
              <span className="text-sm text-muted-foreground">✓ Verificado</span>
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onPatch({ verified: true })}>
                Verificar
              </Button>
            )
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={row.create}
                  disabled={searching}
                  onChange={(e) => onPatch({ create: e.target.checked })}
                />
                Crear
              </label>
            </>
          )}
        </div>
        <div className="flex items-center justify-end max-sm:col-span-2 sm:max-lg:col-span-1">
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Quitar la línea ${n} de la factura`}
              onClick={onRemove}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modificar producto vinculado</DialogTitle>
            <DialogDescription>
              Esta línea ya tiene un producto vinculado. ¿Deseas buscar y seleccionar otro?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmChange(false);
                onPatch({ item: null, verified: false });
                setSearching(true);
              }}
            >
              Modificar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {row.xml && row.item && (
        <p className="truncate pb-1 pl-8 font-mono text-2xs text-muted-foreground max-lg:pl-0" title={row.xml.description}>
          XML: {[row.xml.code, row.xml.description].filter(Boolean).join(" · ")}
          {row.xml.how === "description" && " — producto hallado por un número de parte en la descripción"}
        </p>
      )}
    </li>
  );
}
