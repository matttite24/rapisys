"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Add01Icon, ArrowLeft01Icon, Cancel01Icon, File01Icon, Search01Icon, Tick02Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { HeaderSlot } from "@/components/header-action";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/ui/native-select";
import { MoneyInput } from "@/components/money-input";
import { NumericInput } from "@/components/numeric-input";
import { PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { centsToInput, formatCents, lineAmounts, parseCents, parseDecimal, vatOf } from "@/lib/money";
import {
  completePurchase,
  savePurchaseDraft,
  searchItems,
  searchSuppliers,
  type SupplierOption,
  type ItemOption,
  type PurchaseInput,
  type XmlInfo,
} from "@/lib/purchase-actions";
import { DeletePurchase } from "@/components/purchase-actions-ui";
import { PageShortcuts, useModKey } from "@/components/page-shortcuts";
import { XmlInfoList } from "@/components/xml-info";
import { PartyDrawer } from "@/components/party-drawer";
import { SearchInput } from "@/components/search-input";
import { XmlLoadDialog, type XmlLoaded } from "@/components/purchase-xml-dialog";
import type { SriInvoice } from "@/lib/sri-xml";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  item: ItemOption | null;
  quantity: string;
  cost: string; // costo unitario s/IVA, canónico ("12.50")
  vat: string;
  // Solo en líneas leídas del XML: subtotal exacto de la factura (manda sobre cantidad x costo) y lo que dice el XML.
  total?: number;
  xml?: { code: string; description: string; how?: "code" | "description" | null };
  // Código y nombre de la línea: si no hay producto y se marca "Crear", pasan a ser el número de parte y el nombre
  // del producto nuevo (se crea al completar la factura). Vienen del XML y se pueden editar.
  code: string;
  name: string;
  create: boolean;
  verified: boolean; // la persona confirmó el producto emparejado
};

// Borrador guardado que se retoma: la factura y sus líneas tal como se guardaron.
export type DraftData = {
  id: string;
  supplierId: string;
  number: string;
  date: string;
  notes: string;
  xmlInfo: XmlInfo | null;
  rows: {
    item: ItemOption | null;
    quantity: string;
    cost: string;
    vat: string;
    total?: number;
    xml?: { code: string; description: string };
    code: string;
    name: string;
    create: boolean;
    verified: boolean;
  }[];
};

// Resultado de la última lectura de un XML, para la barra de revisión.
type XmlReview = { invoice: SriInvoice; fileName: string; supplierFound: boolean };

const rowSubtotal = (r: Row): number | null => {
  if (r.total !== undefined) return r.total;
  const qty = parseDecimal(r.quantity);
  const cost = parseCents(r.cost);
  return qty === null || !cost.ok ? null : lineAmounts(qty, cost.cents, 0).subtotal;
};

// Columnas de cada línea de la factura; el encabezado y las filas comparten la misma rejilla.
const ROW_GRID = "grid items-center gap-2 max-sm:grid-cols-2 sm:max-lg:grid-cols-7 lg:grid-cols-[1.5rem_11rem_minmax(0,1fr)_4rem_6rem_3.5rem_6.5rem_10.5rem_2rem]";

// Clave única por fila (no un contador del módulo: con la recarga en caliente el contador vuelve a 0 y repite claves).
// IVA que se puede elegir en cada línea de la factura.
const IVA_OPTIONS = ["15", "5", "0"];
const blank = (): Row => ({ key: crypto.randomUUID(), item: null, quantity: "1", cost: "", vat: "15", code: "", name: "", create: false, verified: false });

// Factura de compra de un contrato: proveedor, número, fecha y líneas. Primero se guarda como borrador (se puede
// dejar incompleta y retomar); al completarla cuenta como compra. Asignarla a las líneas del contrato se hace
// después, desde Abastecimiento.
export function PurchaseForm({
  org,
  contractId,
  suppliers,
  draft,
}: {
  org: string;
  contractId: string;
  suppliers: { id: string; name: string }[];
  draft?: DraftData;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(draft?.supplierId ?? "");
  const [number, setNumber] = useState(draft?.number ?? "");
  const [date, setDate] = useState(() => draft?.date ?? toIsoDate(new Date()));
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    draft?.rows.length ? draft.rows.map((r) => ({ ...r, key: crypto.randomUUID() })) : [blank()],
  );
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [xmlInfo, setXmlInfo] = useState<XmlInfo | null>(draft?.xmlInfo ?? null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<XmlReview>();
  // Los avisos salen arriba y se traen a la vista: en una factura larga el final de la página no lo ve nadie.
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);
  // Lo que falta para poder completar; mientras algo falte, Completar está desactivado y se dice qué.
  const filled = rows.filter((r) => r.item || r.cost || r.xml || r.name.trim() || r.code.trim());
  const noProduct = filled.filter((r) => !r.item && !(r.create && r.name.trim())).length;
  const blockers = [
    !supplierId && "elige el proveedor",
    !number.trim() && "escribe el número de factura",
    filled.length === 0 && "agrega líneas",
    noProduct > 0 && `${noProduct} ${noProduct === 1 ? "línea sin producto" : "líneas sin producto"} (elígelo o marca «Crear»)`,
  ].filter(Boolean) as string[];
  const [leaving, setLeaving] = useState(false);
  const listUrl = `/${org}/contratos/${contractId}/compras`;
  // Cambios sin guardar: lo que hay en pantalla contra lo último guardado (o cargado).
  const snapshot = JSON.stringify([supplierId, number, date, notes, xmlInfo, rows.map((r) => ({ ...r, key: undefined }))]);
  const [saved, setSaved] = useState(snapshot);
  const dirty = snapshot !== saved;
  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierDrawer, setSupplierDrawer] = useState(false);
  const [drawerFromXml, setDrawerFromXml] = useState(false);
  // Campos que se llenaron con el XML cargado (muestran un check verde hasta que la persona los cambia).
  const [fromXml, setFromXml] = useState({ supplier: false, number: false, date: false });
  const clearFromXml = (field: "supplier" | "number" | "date") => setFromXml((f) => ({ ...f, [field]: false }));
  const [xmlOpen, setXmlOpen] = useState(false);

  // Llena el formulario con el XML ya revisado en el modal; no guarda nada.
  function applyXml({ invoice: inv, fileName, supplier, matches }: XmlLoaded) {
    setError(undefined);
    if (supplier) setSupplierId(supplier.id);
    setFromXml({ supplier: !!supplier, number: true, date: true });
    setNumber(inv.number);
    setDate(inv.date);
    if (inv.notes) setNotes(inv.notes);
    setXmlInfo({
      fileName,
      accessKey: inv.accessKey,
      authorization: inv.authorization,
      authorizedAt: inv.authorizedAt,
      buyerRuc: inv.buyer.ruc,
      buyerName: inv.buyer.name,
      subtotalCents: inv.subtotalCents,
      totalCents: inv.totalCents,
    });
    setRows(
      inv.lines.map((l, i) => ({
        key: crypto.randomUUID(),
        item: matches[i].item,
        quantity: String(l.quantity),
        cost: centsToInput(l.unitCents),
        vat: String(l.vat),
        total: l.totalCents,
        xml: { code: l.code, description: l.description, how: matches[i].how },
        code: l.code,
        name: l.description,
        create: false,
        verified: false,
      })),
    );
    setReview({ invoice: inv, fileName, supplierFound: !!supplier });
  }

  const patch = (key: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  // Al elegir el producto, se propone el costo que ese proveedor tiene registrado.
  function pickItem(key: string, item: ItemOption) {
    const price = item.prices.find((p) => p.supplierId === supplierId);
    const fromXml = rows.find((r) => r.key === key)?.total !== undefined; // el costo del XML no se pisa
    patch(key, {
      item,
      create: false,
      verified: true, // lo eligió la persona
      ...(price && !fromXml ? { cost: String(price.costCents / 100), vat: String(price.vat) } : {}),
    });
  }

  const totals = rows.reduce(
    (t, r) => {
      const sub = rowSubtotal(r);
      if (sub === null) return t;
      const vat = vatOf(sub, Number(r.vat) || 0);
      return { subtotal: t.subtotal + sub, vat: t.vat + vat, total: t.total + sub + vat };
    },
    { subtotal: 0, vat: 0, total: 0 },
  );

  // ---- Teclado ----
  // Ctrl/⌘+S guarda, Ctrl/⌘+Enter completa, Alt+N agrega una línea, Alt+X abre el XML y Alt+Enter confirma la
  // línea donde está el cursor (verifica el producto emparejado o marca/desmarca «Crear»). Dentro de las
  // líneas, ↑/↓ (o Enter / Shift+Enter) pasan a la misma columna de la fila de abajo/arriba. Se leen `code`
  // y no `key` en las letras: en Mac Alt+letra produce otros caracteres.
  const modKey = useModKey();
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<string | null>(null);

  function focusCell(li: Element | null | undefined, col: string) {
    const el = li?.querySelector<HTMLInputElement>(`[data-col="${col}"]`) ?? li?.querySelector<HTMLInputElement>('[data-col="qty"]');
    el?.focus();
    el?.select?.();
  }

  function addRow(col: string) {
    pendingFocus.current = col;
    setRows((rs) => [...rs, blank()]);
  }
  // Tras agregar una línea, el cursor va a su primera casilla.
  useEffect(() => {
    const col = pendingFocus.current;
    if (!col) return;
    pendingFocus.current = null;
    focusCell(listRef.current?.lastElementChild, col);
  }, [rows.length]);

  function onGridKey(e: React.KeyboardEvent<HTMLUListElement>) {
    const t = e.target as HTMLElement;
    const col = t.dataset.col;
    if (!col || e.altKey || e.ctrlKey || e.metaKey) return;
    if (t instanceof HTMLInputElement && t.type === "search") return; // los buscadores usan sus propias teclas
    const dir = e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey) ? 1 : e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const li = t.closest("li");
    const next = dir > 0 ? li?.nextElementSibling : li?.previousElementSibling;
    if (next) focusCell(next, col);
    else if (dir > 0 && e.key === "Enter") addRow(col); // Enter en la última línea agrega otra, como en una hoja de cálculo
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (xmlOpen || supplierDrawer) return; // con un modal abierto, el teclado es del modal
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.code === "KeyS") {
        e.preventDefault();
        if (!saving) save(false);
      } else if (mod && !e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (!saving && draftId && blockers.length === 0) save(true);
      } else if (e.altKey && !mod && e.code === "KeyN") {
        e.preventDefault();
        addRow("code");
      } else if (e.altKey && !mod && e.code === "KeyX") {
        e.preventDefault();
        if (!saving && !xmlInfo) setXmlOpen(true);
      } else if (e.altKey && !mod && e.key === "Enter") {
        const key = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("li[data-row-key]")?.dataset.rowKey;
        if (!key) return;
        e.preventDefault();
        setRows((rs) =>
          rs.map((r) => (r.key !== key ? r : r.item ? { ...r, verified: true } : r.name.trim() ? { ...r, create: !r.create } : r)),
        );
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Guarda el borrador (aunque esté incompleto) y, con `complete`, lo pasa a factura completa.
  function save(complete: boolean) {
    if (saving) return;
    setError(undefined);
    const lines: PurchaseInput["lines"] = [];
    const missing: number[] = []; // líneas sin producto ni "Crear" (solo importan al completar)
    for (const [i, r] of rows.entries()) {
      if (!r.item && !r.cost && !r.xml && !r.name.trim() && !r.code.trim()) continue; // fila en blanco
      const cost = parseCents(r.cost);
      if (complete && !r.item && !(r.create && r.name.trim())) missing.push(i + 1);
      // Un borrador admite costos sin llenar (quedan en 0); para completar deben estar.
      if (!cost.ok && complete) return setError(`Línea ${i + 1}: ${cost.error}`);
      lines.push({
        itemId: r.item?.id,
        quantity: r.quantity,
        unitCostCents: cost.ok ? cost.cents : 0,
        lineTotalCents: r.total,
        vatRate: r.vat,
        xmlCode: r.xml?.code,
        xmlDescription: r.xml?.description,
        createItem: r.create,
        newPartNumber: r.code,
        newName: r.name,
        verified: r.verified,
      });
    }
    if (missing.length) {
      const list = missing.length > 8 ? `${missing.slice(0, 8).join(", ")}…` : missing.join(", ");
      return setError(
        `${missing.length === 1 ? "Falta el producto en la línea" : `Faltan productos en ${missing.length} líneas`}: ${list}. Elige el producto o marca «Crear» (con nombre).`,
      );
    }
    setSaving(true);
    startTransition(async () => {
      const res = await savePurchaseDraft(org, contractId, draftId, { supplierId, number, date, notes, lines, xml: xmlInfo });
      if (!res?.id) {
        setError(res?.error);
        return setSaving(false);
      }
      setDraftId(res.id);
      setSaved(snapshot);
      if (!complete) {
        // Los siguientes guardados actualizan este borrador; la URL queda en su pantalla de edición.
        window.history.replaceState(null, "", `/${org}/contratos/${contractId}/compras/${res.id}/editar`);
        toast.success("Borrador guardado.");
        return setSaving(false);
      }
      const done = await completePurchase(org, contractId, res.id);
      if (done?.id) {
        toast.success("Factura completada.");
        router.push(`/${org}/contratos/${contractId}/compras/${res.id}`);
      } else {
        setError(`${done?.error ?? ""} El borrador quedó guardado.`.trim());
        setSaving(false);
      }
    });
  }

  return (
    <>
      <HeaderSlot>
        <div className="flex h-full items-stretch gap-1">
          {draftId ? (
            <>
              <Button variant="ghost" className="h-auto! gap-2 px-4" disabled={saving} title={`Guardar (${modKey} S)`} onClick={() => save(false)}>
                <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
                <span className="max-sm:hidden">Guardar</span>
              </Button>
              <Button className="-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5" disabled={saving || blockers.length > 0} title={`Completar (${modKey} Enter)`} onClick={() => save(true)}>
                <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                <span className="max-sm:hidden">{saving ? "Guardando…" : "Completar"}</span>
              </Button>
            </>
          ) : (
            <>
              {dirty && !leaving ? (
                <Button variant="ghost" className="h-auto! self-stretch px-4" onClick={() => setLeaving(true)}>
                  Cancelar
                </Button>
              ) : dirty ? (
                <Button
                  variant="ghost"
                  autoFocus
                  className="h-auto! self-stretch px-4 text-destructive"
                  onClick={() => router.push(listUrl)}
                  onBlur={() => setLeaving(false)}
                >
                  ¿Salir sin guardar?
                </Button>
              ) : (
                <Link href={listUrl} className={cn(buttonVariants({ variant: "ghost" }), "h-auto! self-stretch px-4")}>
                  Cancelar
                </Link>
              )}
              <Button className="-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5" disabled={saving} title={`Guardar (${modKey} S)`} onClick={() => save(false)}>
                <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
                <span className="max-sm:hidden">{saving ? "Guardando…" : "Guardar"}</span>
              </Button>
            </>
          )}
        </div>
      </HeaderSlot>
      {draftId && blockers.length > 0 && !error && (
        <div className="border-b bg-accent/40 px-4 py-2 text-sm text-muted-foreground">
          Para completar: {blockers.join("; ")}.
        </div>
      )}
      {error && (
        <div ref={errorBox} role="alert" className="border-b border-destructive/40 bg-destructive/10 px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <PageShortcuts
        shortcuts={[
          { keys: [modKey, "S"], label: "Guardar" },
          { keys: [modKey, "↵"], label: "Completar" },
          { keys: ["Alt", "N"], label: "Línea nueva" },
          { keys: ["Alt", "X"], label: "Cargar XML" },
          { keys: ["Alt", "↵"], label: "Verificar / crear" },
          { keys: ["↑", "↓"], label: "Cambiar de fila" },
        ]}
      />
      <XmlLoadDialog
          org={org}
          open={xmlOpen}
          onOpenChange={setXmlOpen}
          replacing={rows.filter((r) => r.item || r.xml || r.cost).length}
          onApply={applyXml}
      />
      {review && <XmlReviewBar review={review} rows={rows} onCreateSupplier={() => {
          setDrawerFromXml(true);
          setSupplierDrawer(true);
        }}
      />}
      <PartyDrawer
          open={supplierDrawer}
          kind="suppliers"
          org={org}
          initial={review ? { name: review.invoice.supplier.name, ruc: review.invoice.supplier.ruc } : undefined}
          onClose={() => setSupplierDrawer(false)}
          onCreated={(sup) => {
            setSupplierList((l) => [...l, sup].sort((a, b) => a.name.localeCompare(b.name, "es")));
            setSupplierId(sup.id);
            setFromXml((f) => ({ ...f, supplier: drawerFromXml }));
            setReview((r) => r && { ...r, supplierFound: true });
            toast.success(`Proveedor «${sup.name}» creado.`);
          }}
      />
      <PageSection
        label={draftId ? "Editar factura" : "Subir factura"}
        className="p-0"
        meta={
          <>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            disabled={saving || !!xmlInfo}
            title={xmlInfo ? "Ya se cargó un XML en esta factura" : "Llena la factura con el XML del SRI"}
            onClick={() => {
              setXmlOpen(true);
            }}
          >
            <HugeiconsIcon icon={File01Icon} className="size-4" />
            Cargar XML
          </Button>
          </>
        }
      >
        <div className="grid gap-x-4 gap-y-5 px-6 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] [&_input]:bg-background">
          <FormField name="supplier" className="min-w-0 sm:col-span-2 xl:col-span-1" label={<XmlLabel text="Proveedor" fromXml={fromXml.supplier} />}>
            {(a11y) => (
              <div className="flex items-stretch gap-2">
                <SupplierPicker
                  id={a11y.id as string}
                  org={org}
                  selected={supplierList.find((x) => x.id === supplierId) ?? null}
                  onPick={(sup) => {
                    setSupplierList((l) => (l.some((x) => x.id === sup.id) ? l : [...l, sup]));
                    setSupplierId(sup.id);
                    clearFromXml("supplier");
                  }}
                  onClear={() => {
                    setSupplierId("");
                    clearFromXml("supplier");
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 self-stretch font-bold text-foreground"
                  aria-label="Crear proveedor"
                  title="Crear proveedor"
                  onClick={() => {
                    setDrawerFromXml(false);
                    setSupplierDrawer(true);
                  }}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-5" strokeWidth={2.5} />
                </Button>
              </div>
            )}
          </FormField>
          <FormField name="number" label={<XmlLabel text="N.º de factura" fromXml={fromXml.number} />}>
            {(a11y) => (
              <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" value={number} onChange={(e) => {
                setNumber(e.target.value);
                clearFromXml("number");
              }} />
            )}
          </FormField>
          <FormField name="date" label={<XmlLabel text="Fecha" fromXml={fromXml.date} />}>
            {(a11y) => <DatePicker {...a11y} className="rounded-lg border border-input bg-background text-base font-normal shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm" name="date" value={date} onChange={(d) => {
              setDate(d);
              clearFromXml("date");
            }} />}
          </FormField>
        </div>
      </PageSection>

      <PageSection className="p-0">
        <div className={`${ROW_GRID} border-b bg-surface-strong px-4 py-2 caps font-medium text-muted-foreground max-lg:hidden`}>
          <span>N.º</span>
          <span>Código</span>
          <span>Descripción / producto</span>
          <span className="text-right">Cantidad</span>
          <span className="text-right">P. unitario</span>
          <span className="text-right">IVA %</span>
          <span className="text-right">Subtotal</span>
          {rows.some((r) => !r.item && !r.create && r.name.trim()) ? (
            <button
              type="button"
              className="text-left caps text-foreground underline underline-offset-4"
              onClick={() => setRows((rs) => rs.map((r) => (!r.item && r.name.trim() ? { ...r, create: true } : r)))}
            >
              Crear todas
            </button>
          ) : (
            <span>Producto</span>
          )}
          <span />
        </div>
        <ul ref={listRef} className="divide-y" onKeyDown={onGridKey}>
          {rows.map((r, i) => (
            <PurchaseRow
              key={r.key}
              n={i + 1}
              row={r}
              org={org}
              canRemove={rows.length > 1}
              onPatch={(change) => patch(r.key, change)}
              onPick={(item) => pickItem(r.key, item)}
              onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => addRow("code")}
          className="flex h-10 w-full items-center justify-center gap-2 border-t caps-md font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Agregar línea
        </button>
      </PageSection>

      <div className="grid items-start gap-4 p-4 lg:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          {xmlInfo && <XmlInfoList info={xmlInfo} subtotalCents={totals.subtotal} totalCents={totals.total} />}
          {draftId && (
            <div>
              <DeletePurchase org={org} contractId={contractId} purchaseId={draftId} invoice={number.trim() || "sin número"} draft />
            </div>
          )}
        </div>
        <dl className="grid w-full min-w-64 grid-cols-[1fr_auto] gap-x-8 gap-y-1 font-mono text-sm lg:w-auto">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="num text-right">{formatCents(totals.subtotal)}</dd>
          <dt className="text-muted-foreground">IVA</dt>
          <dd className="num text-right">{formatCents(totals.vat)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="num text-right font-medium">{formatCents(totals.total)}</dd>
        </dl>
      </div>
      <div className="border-t px-6 py-4">
        <FormField name="notes" label="Notas (opcional)">
          {(a11y) => (
            <Textarea
              {...a11y}
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </FormField>
      </div>
    </>
  );
}

function PurchaseRow({
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
            className="num flex h-9 items-center justify-end rounded-md border border-input bg-muted/40 px-2 font-mono text-sm lg:h-8"
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
        <p className="truncate pb-1 pl-8 font-mono text-[0.6875rem] text-muted-foreground max-lg:pl-0" title={row.xml.description}>
          XML: {[row.xml.code, row.xml.description].filter(Boolean).join(" · ")}
          {row.xml.how === "description" && " — producto hallado por un número de parte en la descripción"}
        </p>
      )}
    </li>
  );
}

// Lo que hay que revisar tras cargar un XML: proveedor, productos sin emparejar y cuadre contra la factura.
function XmlReviewBar({
  review,
  rows,
  onCreateSupplier,
}: {
  review: XmlReview;
  onCreateSupplier: () => void;
  rows: Row[];
}) {
  const { invoice: inv } = review;
  const unmatched = rows.filter((r) => !r.item && !r.create).length;
  const toCreate = rows.filter((r) => !r.item && r.create).length;
  const unverified = rows.filter((r) => r.item && !r.verified).length;
  const item = "flex items-baseline gap-2";
  const bad = "text-destructive";
  return (
    <PageSection label={`Revisión del XML · ${review.fileName}`} className="p-0">
      <ul className="grid gap-2 p-6 text-sm md:grid-cols-2">
        <li className={item}>
          <span className="font-mono text-xs text-muted-foreground">Proveedor</span>
          {review.supplierFound ? (
            <span>{inv.supplier.name} ✓</span>
          ) : (
            <span className={bad}>
              {inv.supplier.name} (RUC {inv.supplier.ruc}) no existe.{" "}
              <button type="button" className="underline underline-offset-4" onClick={onCreateSupplier}>
                Crearlo
              </button>
              .
            </span>
          )}
        </li>
        <li className={item}>
          <span className="font-mono text-xs text-muted-foreground">Comprador</span>
          <span>{inv.buyer.name} · {inv.buyer.ruc}</span>
        </li>
        <li className={item}>
          <span className="font-mono text-xs text-muted-foreground">Productos</span>
          {unmatched ? (
            <span className={bad}>{unmatched} de {rows.length} líneas sin producto: márcalas para crear o búscalas.</span>
          ) : (
            <span>Todas las líneas tienen producto o se crearán ✓</span>
          )}
          {toCreate > 0 && <span className="text-muted-foreground">{toCreate} productos nuevos se crean al completar.</span>}
          {unverified > 0 && <span className="text-muted-foreground">{unverified} por verificar.</span>}
        </li>
      </ul>
    </PageSection>
  );
}

// Busca un producto de la bodega para la línea de la factura. Los resultados flotan bajo el campo
// para que la fila no crezca.
function ItemPicker({
  org,
  item,
  initialQuery = "",
  className,
  onPick,
  onRequestChange,
}: {
  org: string;
  item: ItemOption | null;
  initialQuery?: string;
  className?: string;
  onPick: (item: ItemOption) => void;
  onRequestChange?: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchItems(org, text));

  useEffect(() => {
    if (initialQuery.trim()) run(initialQuery, 0);
    // Búsqueda inicial solo al abrir este selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (item) {
    return (
      <div className={cn("flex h-8 min-w-0 items-center justify-between gap-2 border px-3 text-sm", className)}>
        <span className="min-w-0 truncate">
          {item.name}
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {[item.sku, ...item.partNumbers].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-foreground" onClick={onRequestChange} aria-label="Modificar producto vinculado" title="Modificar producto vinculado">
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    // Al salir de este campo (a otra fila, a otro control) la lista de resultados se cierra.
    <div
      className={cn("relative min-w-0", className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clear();
      }}
    >
      <SearchInput
        variant="field"
        label="Producto: busca en la bodega"
        placeholder="Número de parte, SKU o nombre"
        inputClassName="h-8"
        value={q}
        onChange={(v) => {
          setQ(v);
          // Solo busca cuando hay texto: al enfocar el campo vacío no se muestra nada.
          if (v.trim()) run(v);
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

// Busca el proveedor por nombre o RUC mientras se escribe (con espera, sin una consulta por tecla). Los resultados
// flotan bajo el campo. Ya elegido, muestra el nombre con "Cambiar".
function SupplierPicker({
  id,
  org,
  selected,
  onPick,
  onClear,
}: {
  id: string;
  org: string;
  selected: { id: string; name: string } | null;
  onPick: (supplier: SupplierOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const { results, loading, run, clear } = useDebouncedSearch((text: string) => searchSuppliers(org, text));

  if (selected) {
    return (
      <div id={id} className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-base md:text-sm">
        <span className="min-w-0 truncate">{selected.name}</span>
        <Button type="button" variant="ghost" size="sm" className="h-[1.5rem]" onClick={onClear}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clear();
      }}
    >
      <SearchInput
        variant="field"
        id={id}
        label="Proveedor: busca por nombre o RUC"
        placeholder="Busca por nombre o RUC"
        value={q}
        onChange={(v) => {
          setQ(v);
          if (v.trim()) run(v);
          else clear();
        }}
        onKeyDown={(e) => e.key === "Escape" && clear()}
      />
      {(results !== null || loading) && (
        <ul
          aria-label="Proveedores"
          aria-busy={loading}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 divide-y overflow-y-auto border bg-popover shadow-overlay transition-opacity",
            loading && results !== null && "opacity-60",
          )}
        >
          {results === null ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún proveedor coincide. Usa + para crearlo.</li>
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
                  {r.ruc && <span className="font-mono text-xs text-muted-foreground">{r.ruc}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// Etiqueta de un campo; con un check verde cuando el valor viene del XML cargado.
function XmlLabel({ text, fromXml }: { text: string; fromXml: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {fromXml && (
        <span title="Tomado del XML cargado" className="inline-flex text-foreground">
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
          <span className="sr-only">(tomado del XML)</span>
        </span>
      )}
    </span>
  );
}
