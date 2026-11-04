"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Add01Icon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { HeaderSlot } from "@/components/header-action";
import { FormField } from "@/components/form-field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCents, lineAmounts, parseCents, parseDecimal } from "@/lib/money";
import {
  createPurchase,
  searchCoverable,
  searchItems,
  type CoverableLine,
  type ItemOption,
  type PurchaseInput,
} from "@/lib/purchase-actions";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  item: ItemOption | null;
  quantity: string;
  cost: string; // costo unitario s/IVA, canónico ("12.50")
  vat: string;
  target: CoverableLine | null; // línea del contrato a la que se asigna
  assign: string;
};

// Columnas de cada línea de la factura; el encabezado y las filas comparten la misma rejilla.
const ROW_GRID = "grid items-center gap-2 md:grid-cols-[2rem_minmax(0,1fr)_4.5rem_8rem_4.5rem_minmax(12rem,16rem)_2rem]";

// Clave única por fila (no un contador del módulo: con la recarga en caliente el contador vuelve a 0 y repite claves).
const blank = (): Row => ({ key: crypto.randomUUID(), item: null, quantity: "1", cost: "", vat: "15", target: null, assign: "" });

// Factura de compra de un contrato: proveedor, número, fecha y líneas. Cada línea puede asignarse
// de una vez a una línea de la lista de referencia; lo que no se asigne queda como sobrante.
export function PurchaseForm({
  org,
  contractId,
  suppliers,
}: {
  org: string;
  contractId: string;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const patch = (key: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  // Al elegir el producto, se propone el costo que ese proveedor tiene registrado.
  function pickItem(key: string, item: ItemOption) {
    const price = item.prices.find((p) => p.supplierId === supplierId);
    patch(key, {
      item,
      ...(price ? { cost: String(price.costCents / 100), vat: String(price.vat) } : {}),
    });
  }

  const totals = rows.reduce(
    (t, r) => {
      const qty = parseDecimal(r.quantity);
      const cost = parseCents(r.cost);
      if (qty === null || !cost.ok) return t;
      const a = lineAmounts(qty, cost.cents, Number(r.vat) || 0);
      return { subtotal: t.subtotal + a.subtotal, vat: t.vat + a.vat, total: t.total + a.total };
    },
    { subtotal: 0, vat: 0, total: 0 },
  );

  function submit() {
    if (saving) return;
    setError(undefined);
    const lines: PurchaseInput["lines"] = [];
    for (const [i, r] of rows.entries()) {
      const cost = parseCents(r.cost);
      if (!r.item) return setError(`Línea ${i + 1}: elige el producto.`);
      if (!cost.ok) return setError(`Línea ${i + 1}: ${cost.error}`);
      lines.push({
        itemId: r.item.id,
        quantity: r.quantity,
        unitCostCents: cost.cents,
        vatRate: r.vat,
        contractLineId: r.target?.id,
        assignQty: r.target ? r.assign || r.quantity : undefined,
      });
    }
    setSaving(true);
    startTransition(async () => {
      const res = await createPurchase(org, contractId, { supplierId, number, date, notes, lines });
      if (res?.id) router.push(`/${org}/contratos/${contractId}/compras/${res.id}`);
      else {
        setError(res?.error);
        setSaving(false);
      }
    });
  }

  return (
    <>
      <HeaderSlot>
        <div className="flex h-full items-stretch gap-1">
          <Link
            href={`/${org}/contratos/${contractId}/compras`}
            className={cn(buttonVariants({ variant: "ghost" }), "h-auto! self-stretch px-4")}
          >
            Cancelar
          </Link>
          <Button className="-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5" disabled={saving} onClick={submit}>
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </HeaderSlot>
      <PageSection label="Registrar nueva factura" className="p-0">
        <div className="grid gap-4 p-6 md:grid-cols-[1.5fr_1fr_12rem_2fr]">
          <FormField name="supplier" label="Proveedor">
            {(a11y) => (
              <NativeSelect {...a11y} className="w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Selecciona…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField name="number" label="N.º de factura">
            {(a11y) => (
              <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" value={number} onChange={(e) => setNumber(e.target.value)} />
            )}
          </FormField>
          <FormField name="date" label="Fecha">
            {(a11y) => <DatePicker {...a11y} name="date" value={date} onChange={setDate} />}
          </FormField>
          <FormField name="notes" label="Notas (opcional)">
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </FormField>
        </div>
      </PageSection>

      <PageSection className="p-0">
        <div aria-hidden className={`${ROW_GRID} border-b bg-surface-strong/60 px-6 py-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground max-md:hidden`}>
          <span>N.º</span>
          <span>Producto (busca en la bodega)</span>
          <span className="text-right">Cantidad</span>
          <span className="text-right">Costo unit. s/IVA</span>
          <span className="text-right">IVA %</span>
          <span>Asignar a</span>
          <span />
        </div>
        <ul className="divide-y">
          {rows.map((r, i) => (
            <PurchaseRow
              key={r.key}
              n={i + 1}
              row={r}
              org={org}
              contractId={contractId}
              canRemove={rows.length > 1}
              onPatch={(change) => patch(r.key, change)}
              onPick={(item) => pickItem(r.key, item)}
              onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blank()])}
          className="flex h-12 w-full items-center justify-center gap-2 border-t bg-surface-strong/50 font-mono text-xs font-medium uppercase tracking-[0.1em] transition-colors hover:bg-surface-strong focus-visible:bg-surface-strong focus-visible:outline-none"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Agregar línea
        </button>
      </PageSection>

      <div className="flex flex-col gap-4 p-6">
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-8 gap-y-1 font-mono text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="num text-right">{formatCents(totals.subtotal)}</dd>
          <dt className="text-muted-foreground">IVA</dt>
          <dd className="num text-right">{formatCents(totals.vat)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="num text-right font-medium">{formatCents(totals.total)}</dd>
        </dl>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </>
  );
}

function PurchaseRow({
  n,
  row,
  org,
  contractId,
  canRemove,
  onPatch,
  onPick,
  onRemove,
}: {
  n: number;
  row: Row;
  org: string;
  contractId: string;
  canRemove: boolean;
  onPatch: (change: Partial<Row>) => void;
  onPick: (item: ItemOption) => void;
  onRemove: () => void;
}) {
  const hint = "font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground md:hidden";
  return (
    <li className="px-6 py-1.5">
      <div className={ROW_GRID}>
        <span className="num text-muted-foreground max-md:hidden">{n}</span>
        <ItemPicker org={org} item={row.item} onPick={onPick} onClear={() => onPatch({ item: null })} />
        <label className="flex flex-col gap-1">
          <span className={hint}>Cantidad</span>
          <NumericInput
            kind="decimal"
            aria-label={`Cantidad de la línea ${n}`}
            className="h-8 font-mono"
            value={row.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={hint}>Costo unit. s/IVA</span>
          <MoneyInput
            aria-label={`Costo unitario sin IVA de la línea ${n}`}
            className="h-8"
            name={`cost-${row.key}`}
            value={row.cost}
            onChange={(cost) => onPatch({ cost })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={hint}>IVA %</span>
          <NumericInput
            kind="decimal"
            aria-label={`IVA de la línea ${n}`}
            className="h-8 font-mono"
            value={row.vat}
            onChange={(e) => onPatch({ vat: e.target.value })}
          />
        </label>
        <TargetAction contractId={contractId} n={n} row={row} onPatch={onPatch} />
        <div className="flex justify-end">
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
    </li>
  );
}

// Busca un producto de la bodega para la línea de la factura. Los resultados flotan bajo el campo
// para que la fila no crezca.
function ItemPicker({
  org,
  item,
  onPick,
  onClear,
}: {
  org: string;
  item: ItemOption | null;
  onPick: (item: ItemOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchItems(org, text));

  if (item) {
    return (
      <div className="flex h-8 items-center justify-between gap-2 border px-3 text-sm">
        <span className="min-w-0 truncate">
          {item.name}
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {[item.sku, ...item.partNumbers].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-[1.5rem]" onClick={onClear}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    // Al salir de este campo (a otra fila, a otro control) la lista de resultados se cierra.
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clear();
      }}
    >
      <Input
        type="search"
        aria-label="Producto: busca en la bodega"
        className="h-8"
        autoComplete="off"
        placeholder="Número de parte, SKU o nombre"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          // Solo busca cuando hay texto: al enfocar el campo vacío no se muestra nada.
          if (e.target.value.trim()) run(e.target.value);
          else clear();
        }}
        onKeyDown={(e) => e.key === "Escape" && clear()}
      />
      {(results !== null || loading) && (
        <ul
          aria-label="Productos"
          aria-busy={loading}
          // Pulsar la barra de desplazamiento o un espacio de la lista no debe quitarle el foco al campo.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 divide-y overflow-y-auto border bg-popover shadow-overlay transition-opacity",
            loading && results !== null && "opacity-60",
          )}
        >
          {results === null ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="flex flex-col gap-1 px-3 py-2 text-sm text-muted-foreground">
              Ningún producto coincide.
              <Link
                href={`/${org}/bodega/nuevo?parte=${encodeURIComponent(q)}`}
                target="_blank"
                className="text-foreground underline underline-offset-4"
              >
                Crear el producto en la bodega
              </Link>
            </li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onPick(r);
                    clear();
                    setQ("");
                  }}
                >
                  <span>{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {[r.sku, ...r.partNumbers].filter(Boolean).join(" · ") || "Sin SKU ni número de parte"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// Acción al final de la fila: asignar la línea de la factura a una línea de la lista de referencia
// del contrato (opcional). Ya asignada, muestra a cuál y cuántas unidades.
function TargetAction({
  contractId,
  n,
  row,
  onPatch,
}: {
  contractId: string;
  n: number;
  row: Row;
  onPatch: (change: Partial<Row>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {row.target ? (
        <div className="flex items-center gap-2" title={`«${row.target.listName}»: ${row.target.description}. Faltan ${row.target.open}.`}>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-mono text-xs text-muted-foreground">Línea </span>
            <span className="num">{row.target.n}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              {row.target.partNumber ? `${row.target.partNumber} · ` : ""}
              {row.target.description}
            </span>
          </span>
          <NumericInput
            kind="decimal"
            aria-label={`Unidades de la línea ${n} que se asignan a esa línea del contrato`}
            className="h-8 w-16 shrink-0 font-mono"
            value={row.assign || row.quantity}
            onChange={(e) => onPatch({ assign: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label="Quitar la asignación"
            onClick={() => onPatch({ target: null, assign: "" })}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-[2rem] justify-self-start" onClick={() => setOpen(true)}>
          Asignar
        </Button>
      )}
      <TargetDialog
        open={open}
        onOpenChange={setOpen}
        contractId={contractId}
        row={row}
        onPick={(l) => {
          const qty = parseDecimal(row.quantity) ?? 0;
          onPatch({ target: l, assign: String(Math.min(qty, l.open)) });
          setOpen(false);
        }}
      />
    </>
  );
}

// Selector de la línea del contrato: abre con el número de parte del producto ya buscado.
function TargetDialog({
  open,
  onOpenChange,
  contractId,
  row,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  row: Row;
  onPick: (line: CoverableLine) => void;
}) {
  const { results, loading, run } = useDebouncedSearch((text: string) => searchCoverable(contractId, text));

  // Al abrir, busca de inmediato con el número de parte del producto.
  useEffect(() => {
    if (open) run(row.item?.partNumbers[0] ?? "", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>Asignar a una línea del contrato</DialogTitle>
          <DialogDescription>
            {row.item ? `Para ${row.item.name}. ` : ""}Lo que no se asigne queda como existencia libre al recibirse.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b p-4">
          <Input
            type="search"
            autoFocus
            autoComplete="off"
            aria-label="Buscar línea del contrato"
            placeholder="Número de parte o descripción de la línea"
            defaultValue={row.item?.partNumbers[0] ?? ""}
            onChange={(e) => run(e.target.value)}
          />
        </div>
        <ul aria-busy={loading} className={cn("max-h-80 divide-y overflow-y-auto transition-opacity", loading && results !== null && "opacity-60")}>
          {results === null && <li className="px-6 py-4 text-sm text-muted-foreground">Buscando…</li>}
          {results?.length === 0 && (
            <li className="px-6 py-4 text-sm text-muted-foreground">Ninguna línea pendiente coincide.</li>
          )}
          {results?.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 px-6 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onPick(l)}
              >
                <span className="num text-muted-foreground">{l.n}</span>
                <span className="font-mono text-xs text-muted-foreground">{l.partNumber || "—"}</span>
                <span className="min-w-0 flex-1 truncate">{l.description}</span>
                <span className="text-xs text-muted-foreground">
                  «{l.listName}» · faltan <span className="num">{l.open}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
