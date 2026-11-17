"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Add01Icon, Delete02Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormField } from "@/components/form-field";
import { HeaderSlot, HeaderTitle } from "@/components/header-action";
import { PageFigures, PageFooterActions } from "@/components/page-shortcuts";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { CellGrid, PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCents, parseCents, parseDecimal, salePriceCents, withVatCents } from "@/lib/money";
import { deleteItem, saveItem } from "@/lib/item-actions";
import {
  ASSET_KIND_LABEL,
  DEFAULT_VAT,
  MARGIN_PRESETS,
  type AssetKind,
  type PriceRow,
  type SpecRow,
} from "@/lib/items";

type Option = { id: string; name: string };
export type AssetOption = { id: string; name: string; kind: AssetKind; detail: string };

export type ItemData = {
  id: string;
  name: string;
  tdr_name: string | null;
  sku: string | null;
  internal_code: string | null;
  barcode: string | null;
  unit: string | null;
  retail_price_cents: number | null;
  line: string | null;
  description: string | null;
  category_id: string | null;
  part_numbers: string[];
  specs: Record<string, string>;
  margin_percent: number;
  is_active: boolean;
  prices: PriceRow[];
  asset_ids: string[];
};

const NEW = "__new__";
const ROW_BTN = "size-10 shrink-0 text-muted-foreground";
const ROW_LABEL = "caps text-muted-foreground";

export function ItemForm({
  org,
  item,
  categories,
  suppliers,
  assets,
  canDelete,
  onHand = 0,
  defaults,
}: {
  org: string;
  item?: ItemData;
  // Datos de partida de un item nuevo (p. ej. venido de una línea del proceso).
  defaults?: { name?: string; part?: string };
  categories: Option[];
  suppliers: Option[];
  assets: AssetOption[];
  canDelete?: boolean;
  onHand?: number;
}) {
  const [state, action, pending] = useActionState(
    saveItem.bind(null, org, item?.id ?? null),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const errors = state?.fields ?? {};

  const [category, setCategory] = useState(item?.category_id ?? "");
  const [active, setActive] = useState(item?.is_active !== false);
  const [specs, setSpecs] = useState<SpecRow[]>(() =>
    Object.entries(item?.specs ?? {}).map(([key, value]) => ({ key, value })),
  );
  const [prices, setPrices] = useState<PriceRow[]>(item?.prices ?? []);
  const [assetIds, setAssetIds] = useState<string[]>(item?.asset_ids ?? []);
  const assetSet = useMemo(() => new Set(assetIds), [assetIds]);
  const inPresets = item ? (MARGIN_PRESETS as readonly number[]).includes(item.margin_percent) : true;
  const [margin, setMargin] = useState(inPresets ? String(item?.margin_percent ?? 40) : "custom");
  const [customMargin, setCustomMargin] = useState(inPresets ? "" : String(item?.margin_percent));

  const marginValue = parseDecimal(margin === "custom" ? customMargin : margin);
  // Se vende sobre el costo más bajo (con IVA) entre los proveedores.
  const bestCost = useMemo(() => {
    // Costo con IVA de cada proveedor: el margen se aplica sobre lo realmente pagado.
    const costs = prices.flatMap((p) => {
      const c = parseCents(p.unit_cost);
      const v = parseDecimal(p.vat_rate);
      return c.ok && v !== null ? [withVatCents(c.cents, v)] : [];
    });
    return costs.length ? Math.min(...costs) : null;
  }, [prices]);

  useEffect(() => {
    if (!state) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const setPrice = (i: number, patch: Partial<PriceRow>) =>
    setPrices((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setSpec = (i: number, patch: Partial<SpecRow>) =>
    setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const byKind = (Object.keys(ASSET_KIND_LABEL) as AssetKind[])
    .map((kind) => ({ kind, list: assets.filter((a) => a.kind === kind) }))
    .filter((g) => g.list.length);

  return (
    <form
      id={formId}
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return; // un segundo Enter no debe enviar de nuevo
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <HeaderTitle>{item ? "Editar item" : "Nuevo item"}</HeaderTitle>
      <PageFigures figures={[{ label: "Existencias", value: String(onHand) }]} />
      <HeaderSlot>
        <div className="flex h-full items-stretch">
          <Link href={`/${org}/bodega`} className={buttonVariants({ variant: "ghost" }) + " h-auto! self-stretch px-4"}>
            Cancelar
          </Link>
          <Button type="submit" form={formId} disabled={pending} className="-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5">
            <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </HeaderSlot>
      {state?.error && <div role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{state.error}</div>}
      <input type="hidden" name="specs" value={JSON.stringify(specs)} />
      <input type="hidden" name="prices" value={JSON.stringify(prices)} />
      <input type="hidden" name="asset_ids" value={JSON.stringify(assetIds)} />

      <PageSection index="01" label="Identificación" className="p-0">
        <CellGrid className="border-0 sm:grid-cols-2 xl:grid-cols-4">
          <FormField name="is_active" label="Estado" className="sm:col-span-2 xl:col-span-4">
            {() => (
              <div className="flex items-center gap-3">
                <input type="hidden" name="is_active" value={active ? "active" : "inactive"} />
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label="Estado del item"
                  onClick={() => setActive((v) => !v)}
                  className={cn("relative block h-6 w-11! shrink-0 cursor-pointer rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", active ? "bg-state-stock" : "bg-foreground/25")}
                >
                  <span aria-hidden className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", active && "translate-x-5")} />
                </button>
                <span className="text-sm font-medium">{active ? "Activo" : "Inactivo"}</span>
              </div>
            )}
          </FormField>
          <FormField name="name" label="Nombre" error={errors.name} className="sm:col-span-2">
            {(a11y) => <Input {...a11y} required autoFocus defaultValue={item?.name ?? defaults?.name} />}
          </FormField>
          <FormField name="tdr_name" label="Nombre TDR (opcional)" error={errors.tdr_name} className="sm:col-span-2">
            {(a11y) => <Input {...a11y} maxLength={300} defaultValue={item?.tdr_name ?? ""} />}
          </FormField>
          <FormField name="description" label="Descripción (opcional)" className="sm:col-span-2">
            {(a11y) => <Input {...a11y} defaultValue={item?.description ?? ""} />}
          </FormField>
          <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
            <FormField name="category_id" label="Categoría">
              {(a11y) => (
                <NativeSelect
                  {...a11y}
                  className="w-full"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Crear nueva…</option>
                </NativeSelect>
              )}
            </FormField>
            {category === NEW && (
              <FormField name="new_category" label="Nombre de la categoría" error={errors.new_category}>
                {(a11y) => <Input {...a11y} required />}
              </FormField>
            )}
          </div>
        </CellGrid>
      </PageSection>

      <PageSection index="02" label="Referencias" className="p-0">
        <CellGrid className="border-0 md:grid-cols-12">
          <FormField name="sku" label="SKU (opcional)" error={errors.sku} className="md:col-span-3">
            {(a11y) => <Input {...a11y} className="font-mono" defaultValue={item?.sku ?? ""} />}
          </FormField>
          <FormField name="internal_code" label="Código interno (opcional)" className="md:col-span-3">
            {(a11y) => <Input {...a11y} maxLength={60} className="font-mono" defaultValue={item?.internal_code ?? ""} />}
          </FormField>
          <FormField name="barcode" label="Código de barras (opcional)" className="md:col-span-3">
            {(a11y) => <Input {...a11y} maxLength={60} className="font-mono" defaultValue={item?.barcode ?? ""} />}
          </FormField>
          <FormField name="unit" label="Unidad de medida (opcional)" className="md:col-span-3">
            {(a11y) => <Input {...a11y} maxLength={30} defaultValue={item?.unit ?? ""} />}
          </FormField>
          {[1, 2, 3].map((n) => (
            <FormField key={n} name={`part_${n}`} label={`Número de parte ${n}`} className="md:col-span-4">
              {(a11y) => (
                <Input {...a11y} className="font-mono" defaultValue={item?.part_numbers[n - 1] ?? (n === 1 ? (defaults?.part ?? "") : "")} />
              )}
            </FormField>
          ))}
        </CellGrid>
      </PageSection>

      <PageSection index="03" label="Especificación técnica" className="flex flex-col gap-3">
        {specs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin campos. Agrega los que describan al item: marca, medida, material…
          </p>
        )}
        {specs.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              aria-label={`Nombre de la especificación ${i + 1}`}
              placeholder="Campo (p. ej. Medida)"
              value={row.key}
              onChange={(e) => setSpec(i, { key: e.target.value })}
            />
            <Input
              aria-label={`Valor de la especificación ${i + 1}`}
              placeholder="Valor"
              value={row.value}
              onChange={(e) => setSpec(i, { value: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ROW_BTN}
              aria-label={`Quitar especificación ${i + 1}`}
              onClick={() => setSpecs((rows) => rows.filter((_, j) => j !== i))}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </div>
        ))}
        {errors.specs && <FieldError>{errors.specs}</FieldError>}
        <div>
          <Button type="button" variant="outline" onClick={() => setSpecs((r) => [...r, { key: "", value: "" }])}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" /> Agregar campo
          </Button>
        </div>
      </PageSection>

      <PageSection index="04" label="Costo por proveedor" className="flex flex-col gap-3">
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay proveedores.{" "}
            <Link href={`/${org}/proveedores/nuevo`} className="underline underline-offset-4">
              Crea el primero
            </Link>{" "}
            para registrar costos.
          </p>
        ) : (
          <>
            {prices.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin costos. Agrega un proveedor con su costo sin IVA y la tarifa de IVA por separado.
              </p>
            )}
            {prices.map((row, i) => {
              const cost = parseCents(row.unit_cost);
              const vat = parseDecimal(row.vat_rate);
              return (
                <div key={i} className="grid grid-cols-2 items-end gap-3 border-b pb-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_5rem_minmax(0,1fr)_8rem_auto]">
                  <label className="col-span-2 flex min-w-0 flex-col gap-1 xl:col-span-1">
                    <span className={ROW_LABEL}>Proveedor</span>
                  <NativeSelect
                    aria-label={`Proveedor ${i + 1}`}
                    className="w-full"
                    value={row.supplier_id}
                    onChange={(e) => setPrice(i, { supplier_id: e.target.value })}
                  >
                    <option value="">Proveedor…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={ROW_LABEL}>Costo sin IVA</span>
                  <MoneyInput
                    name={`unit_cost_${i}`}
                    aria-label={`Costo sin IVA ${i + 1}`}
                    placeholder="Costo sin IVA"
                    value={row.unit_cost}
                    onChange={(v) => setPrice(i, { unit_cost: v })}
                  />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={ROW_LABEL}>IVA %</span>
                  <NumericInput
                    kind="decimal"
                    aria-label={`IVA % ${i + 1}`}
                    placeholder="IVA %"
                    className="font-mono"
                    value={row.vat_rate}
                    onChange={(e) => setPrice(i, { vat_rate: e.target.value })}
                  />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={ROW_LABEL}>Cód. proveedor</span>
                  <Input
                    aria-label={`Código del proveedor ${i + 1}`}
                    placeholder="Cód. proveedor"
                    className="font-mono"
                    value={row.supplier_sku}
                    onChange={(e) => setPrice(i, { supplier_sku: e.target.value })}
                  />
                  </label>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className={ROW_LABEL}>Costo con IVA</span>
                    <output className="num flex h-9 items-center justify-end border border-input px-2 text-sm" aria-label={`Costo con IVA ${i + 1}`}>
                      {cost.ok && vat !== null ? formatCents(withVatCents(cost.cents, vat)) : "—"}
                    </output>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={ROW_BTN + " col-span-2 justify-self-end xl:col-span-1"}
                    aria-label={`Quitar costo ${i + 1}`}
                    onClick={() => setPrices((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                </div>
              );
            })}
            {errors.prices && <FieldError>{errors.prices}</FieldError>}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setPrices((r) => [...r, { supplier_id: "", unit_cost: "", vat_rate: DEFAULT_VAT, supplier_sku: "" }])
                }
              >
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" /> Agregar proveedor
              </Button>
            </div>
          </>
        )}
      </PageSection>

      <PageSection index="05" label="Precio de venta" className="p-0">
        <CellGrid className="border-0 md:grid-cols-3">
          <div className="flex flex-col gap-4">
            <FormField name="margin" label="Margen de utilidad" error={errors.margin}>
              {(a11y) => (
                <NativeSelect {...a11y} className="w-full" value={margin} onChange={(e) => setMargin(e.target.value)}>
                  {MARGIN_PRESETS.map((m) => (
                    <option key={m} value={m}>
                      {m}%
                    </option>
                  ))}
                  <option value="custom">Otro…</option>
                </NativeSelect>
              )}
            </FormField>
            {margin === "custom" && (
              <FormField name="margin_custom" label="Margen (%)">
                {(a11y) => (
                  <NumericInput
                    {...a11y}
                    kind="decimal"
                    className="font-mono"
                    value={customMargin}
                    onChange={(e) => setCustomMargin(e.target.value)}
                  />
                )}
              </FormField>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="caps text-muted-foreground">
              Costo más bajo (con IVA)
            </span>
            <span className="num text-lg">{bestCost !== null ? formatCents(bestCost) : "—"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="caps text-muted-foreground">
              Precio de venta
            </span>
            <span className="num text-lg">
              {bestCost !== null && marginValue !== null ? formatCents(salePriceCents(bestCost, marginValue)) : "—"}
            </span>
          </div>
        </CellGrid>
      </PageSection>

      <PageSection index="06" label="Compatibilidad con activos" className="flex flex-col gap-4">
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay activos.{" "}
            <Link href={`/${org}/bodega/activos/nuevo`} className="underline underline-offset-4">
              Registra vehículos o maquinaria
            </Link>{" "}
            para asociarlos al item.
          </p>
        ) : (
          byKind.map((g) => (
            <fieldset key={g.kind} className="flex flex-col gap-2">
              <legend className="mb-1 caps text-muted-foreground">
                {ASSET_KIND_LABEL[g.kind]}
              </legend>
              <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                {g.list.map((a) => (
                  <label key={a.id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={assetSet.has(a.id)}
                      onChange={(e) =>
                        setAssetIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))
                      }
                    />
                    <span>
                      {a.name}
                      {a.detail && <span className="ml-2 font-mono text-xs text-muted-foreground">{a.detail}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))
        )}
      </PageSection>

      {item && canDelete && <PageFooterActions><ConfirmDelete label="Eliminar item" onConfirm={() => deleteItem(org, item.id)} /></PageFooterActions>}
    </form>
  );
}
