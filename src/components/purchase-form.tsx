"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Add01Icon, File01Icon, Tick02Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { HeaderSlot } from "@/components/header-action";
import { FormField } from "@/components/form-field";
import { PageSection } from "@/components/page-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { centsToInput, formatCents, parseCents, vatOf } from "@/lib/money";
import { completePurchase, savePurchaseDraft, type ItemOption, type PurchaseInput, type XmlInfo } from "@/lib/purchase-actions";
import { DeletePurchase } from "@/components/purchase-actions-ui";
import { PageShortcuts, useModKey } from "@/components/page-shortcuts";
import { XmlInfoList } from "@/components/xml-info";
import { PartyDrawer } from "@/components/party-drawer";
import { XmlLoadDialog, type XmlLoaded } from "@/components/purchase-xml-dialog";
import { cn } from "@/lib/utils";
import { DraftData, ROW_GRID, Row, XmlReview, blank, rowSubtotal } from "@/components/purchase-form-model";
import { PurchaseRow } from "@/components/purchase-row";
import { XmlReviewBar } from "@/components/xml-review-bar";
import { SupplierPicker } from "@/components/purchase-pickers";
import { XmlLabel } from "@/components/xml-label";

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


