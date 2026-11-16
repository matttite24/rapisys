"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelLoading } from "@/components/panel-loading";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { addQuotation, finishQuotationUpload, getQuotationFileUrl, listQuotations, prepareQuotationUpload, type Quotation, type QuoteSupplier } from "@/lib/quotation-actions";
import { formatCents, lineAmounts, parseCents } from "@/lib/money";
import { whatsappUrl } from "@/lib/whatsapp";
import { FILE_ACCEPT, FILES_BUCKET, MAX_FILE_BYTES, formatBytes, resolveMime } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { SupplierField } from "@/components/quotation-supplier-field";
import { VatBreakdown } from "@/components/quotation-vat";
import {
  Attachment01Icon, Call02Icon, Cancel01Icon, Clock01Icon, File01Icon, Link01Icon, Mail01Icon,
  Money03Icon, PackageIcon, Store01Icon, WhatsappIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const date = (value: string) => new Date(value).toLocaleString("es-EC", {
  timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function LineQuotations({ org, contractId, lineId, canAct, onSaved, vatRate = 15, quantity = 1, lineLabel = "" }: {
  org: string; contractId: string; lineId: string; canAct: boolean; onSaved: () => Promise<void>;
  // IVA del proceso y cantidad de la línea, para calcular el precio con IVA; y el nombre de la línea para el mensaje.
  vatRate?: number; quantity?: number; lineLabel?: string;
}) {
  const [rows, setRows] = useState<Quotation[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true);
  // Campos que se relacionan entre sí (proveedor del catálogo, contacto, precio): van controlados.
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [saveSupplier, setSaveSupplier] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const cost = unitCost.trim() ? parseCents(unitCost) : null;
  const costCents = cost && cost.ok ? cost.cents : null;

  function resetForm() {
    setSupplier(""); setSupplierId(""); setPhone(""); setEmail(""); setUnitCost(""); setSaveSupplier(false); setFiles([]); setFileError("");
  }
  function pick(r: QuoteSupplier) {
    setSupplier(r.name); setSupplierId(r.id);
    if (r.phone) setPhone(r.phone);
    if (r.email) setEmail(r.email);
  }
  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) { setFileError(`«${f.name}» supera los 15 MB.`); continue; }
      if (!resolveMime(f.name, f.type)) { setFileError(`«${f.name}» no es un tipo de archivo admitido.`); continue; }
      if (next.length >= 5) { setFileError("Máximo 5 archivos por gestión."); break; }
      setFileError("");
      next.push(f);
    }
    setFiles(next);
  }
  // Sube cada adjunto directo a Storage y lo registra en la cotización ya guardada. Devuelve cuántos fallaron.
  async function uploadFiles(quotationId: string): Promise<number> {
    const supabase = createClient();
    let failed = 0;
    for (const f of files) {
      const meta = { name: f.name, size: f.size, type: f.type };
      try {
        const prep = await prepareQuotationUpload(org, contractId, quotationId, meta);
        if (prep.error || !prep.path || !prep.token) { failed++; continue; }
        const up = await supabase.storage.from(FILES_BUCKET).uploadToSignedUrl(prep.path, prep.token, f, { contentType: prep.mime });
        if (up.error) { failed++; continue; }
        const fin = await finishQuotationUpload(org, contractId, quotationId, { ...meta, path: prep.path });
        if (fin.error) failed++;
      } catch { failed++; }
    }
    return failed;
  }

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void listQuotations(org, contractId, lineId).then((result) => {
      if (!alive) return;
      if (result.error) setError(result.error);
      else { setRows(result.rows ?? []); setMore(!!result.more); setError(""); }
    }).catch(() => alive && setError("No se pudo cargar el historial. Inténtalo de nuevo."));
    return () => { alive = false; mounted.current = false; };
  }, [org, contractId, lineId, retry]);

  async function loadMore() {
    if (loading || !rows) return;
    setLoading(true);
    try {
      const result = await listQuotations(org, contractId, lineId, rows.length);
      if (!mounted.current) return;
      if (result.error) setError(result.error);
      else { setRows([...rows, ...(result.rows ?? [])]); setMore(!!result.more); setError(""); }
    } catch { if (mounted.current) setError("No se pudo cargar el historial. Inténtalo de nuevo."); }
    finally { if (mounted.current) setLoading(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setFormError("");
    try {
      const result = await addQuotation(org, contractId, lineId, data);
      if (result.error) { if (mounted.current) setFormError(result.error); return; }
      const failed = result.id && files.length ? await uploadFiles(result.id) : 0;
      toast.success("Gestión guardada en el historial.");
      if (failed) toast.error(failed === 1 ? "No se pudo subir un archivo adjunto." : `No se pudieron subir ${failed} archivos adjuntos.`);
      if (mounted.current) {
        form.reset(); resetForm(); setEditing(false); setRows(null); setMore(false); setError(""); setRetry((n) => n + 1);
      }
      await onSaved();
    } catch { if (mounted.current) setFormError("No se pudo completar la acción. Inténtalo de nuevo."); }
    finally { if (mounted.current) setSaving(false); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Misma altura y forma que la fila de la factura y la de la bodega: título, una línea de detalle y la acción. */}
      <div className="flex h-14 items-center justify-between gap-3 border-b bg-surface-strong px-4">
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-sm font-medium">Historial</h3>
          <p className="truncate font-mono text-xs text-muted-foreground" title="El primer registro pasa la línea pendiente a Cotizando.">
            Consultas, precios y proformas
          </p>
        </div>
        {canAct && !editing && (
          <Button size="xs" aria-label="Registrar gestión" onClick={() => setEditing(true)}>
            Registrar
          </Button>
        )}
      </div>
      {editing && canAct && (
        <form onSubmit={save} className="space-y-4 border-b bg-muted/20 p-4">
          <fieldset disabled={saving} className="space-y-4">
            <FormField name="supplier" label="Proveedor" hint={supplierId ? "Del catálogo de proveedores" : undefined}>
              {() => <SupplierField org={org} name={supplier} linked={!!supplierId} onName={setSupplier} onPick={pick} onUnlink={() => setSupplierId("")} />}
            </FormField>
            <input type="hidden" name="supplierId" value={supplierId} />
            <div className="grid grid-cols-2 gap-3">
              <FormField name="phone" label="Teléfono / WhatsApp">{(props) => <Input {...props} type="tel" maxLength={50} placeholder="099 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />}</FormField>
              <FormField name="email" label="Correo">{(props) => <Input {...props} type="email" maxLength={200} placeholder="ventas@proveedor.com" value={email} onChange={(e) => setEmail(e.target.value)} />}</FormField>
            </div>
            {phone && whatsappUrl(phone, lineLabel ? `Hola, necesito cotización de: ${lineLabel}` : undefined) && (
              <a
                href={whatsappUrl(phone, lineLabel ? `Hola, necesito cotización de: ${lineLabel}` : undefined) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-state-stock-ink underline-offset-4 hover:underline"
              >
                <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
                Escribir por WhatsApp
              </a>
            )}
            {!supplierId && supplier.trim() && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="saveSupplier" checked={saveSupplier} onChange={(e) => setSaveSupplier(e.target.checked)} className="size-4 accent-[var(--brand)]" />
                Guardar «{supplier.trim()}» como proveedor
              </label>
            )}
            <FormField name="note" label="Gestión y siguiente paso" hint="Puedes registrar una llamada aunque todavía no tengas precio.">{(props) => (
              <Textarea {...props} required autoFocus maxLength={5000} rows={3} placeholder="Llamé al proveedor. Confirmará disponibilidad mañana…" />
            )}</FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField name="unitCost" label="Precio unitario sin IVA (USD)" hint="Opcional">{(props) => <NumericInput {...props} kind="decimal" placeholder="0,00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />}</FormField>
              <FormField name="availability" label="Disponibilidad">{(props) => <Input {...props} maxLength={300} placeholder="Por confirmar, 2 unidades…" />}</FormField>
            </div>
            {costCents !== null && <VatBreakdown unitCents={costCents} quantity={quantity} vatRate={vatRate} />}
            <FormField name="leadTime" label="Plazo de entrega">{(props) => <Input {...props} maxLength={300} placeholder="Entrega inmediata, 5 días…" />}</FormField>
            <FormField name="proformaUrl" label="Enlace a proforma" hint="Enlace al documento, carpeta o conversación.">{(props) => <Input {...props} type="url" maxLength={2000} placeholder="https://…" />}</FormField>
            <div className="space-y-2">
              <span className="text-sm font-medium">Documentos adjuntos</span>
              <label className="flex cursor-pointer items-center gap-2 border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50">
                <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
                Adjuntar proforma, cotización o fotos
                <input type="file" multiple accept={FILE_ACCEPT} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {fileError && <p role="alert" className="text-xs text-destructive">{fileError}</p>}
              {files.length > 0 && (
                <ul className="divide-y border">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="num text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                      <button type="button" aria-label={`Quitar ${f.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditing(false); setFormError(""); resetForm(); }}>Cancelar</Button>
              <Button type="submit">{saving ? "Guardando…" : "Guardar gestión"}</Button>
            </div>
          </fieldset>
        </form>
      )}
      {error && <div role="alert" className="space-y-2 p-4"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setRetry((n) => n + 1); }}>Reintentar</Button></div>}
      {!rows && !error && <PanelLoading label="Cargando historial de cotizaciones" />}
      {rows?.length === 0 && <div className="space-y-2 px-6 py-10 text-center"><p className="text-sm font-medium">Todavía no hay gestiones registradas</p><p className="text-sm text-muted-foreground">Registra la primera consulta para iniciar el seguimiento de este ítem.</p></div>}
      <ol className="divide-y">
        {rows?.map((entry) => (
          <QuotationItem key={entry.id} entry={entry} vatRate={vatRate} quantity={quantity} lineLabel={lineLabel} />
        ))}
      </ol>
      {more && <div className="p-4"><Button variant="outline" className="w-full" disabled={loading} onClick={loadMore}>{loading ? "Cargando…" : "Ver gestiones anteriores"}</Button></div>}
    </div>
  );
}

async function openFile(id: string) {
  const res = await getQuotationFileUrl(id);
  if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
  else toast.error(res.error ?? "No se pudo abrir el archivo.");
}

// Un registro del historial: proveedor y fecha, vías de contacto con su icono, el resultado de la gestión, el precio con su
// IVA calculado, y los datos y documentos de la oferta.
function QuotationItem({ entry, vatRate, quantity, lineLabel }: { entry: Quotation; vatRate: number; quantity: number; lineLabel: string }) {
  const wa = entry.phone ? whatsappUrl(entry.phone, lineLabel ? `Hola, te escribo por la cotización de: ${lineLabel}` : undefined) : null;
  const unit = entry.unit_cost_cents === null ? null : lineAmounts(1, entry.unit_cost_cents, vatRate);
  const all = entry.unit_cost_cents === null ? null : lineAmounts(quantity, entry.unit_cost_cents, vatRate);
  const chip = "inline-flex h-7 items-center gap-1.5 border px-2 text-xs font-medium transition-colors hover:bg-accent";
  return (
    <li className="space-y-3 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Store01Icon} className="size-4" />
          </span>
          <span className="truncate font-semibold">{entry.supplier || "Gestión de búsqueda"}</span>
        </div>
        <time dateTime={entry.created_at} className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{date(entry.created_at)}</time>
      </div>
      {(entry.phone || entry.email || entry.contact) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.phone && (
            <a href={`tel:${entry.phone.replace(/[^\d+]/g, "")}`} className={chip}>
              <HugeiconsIcon icon={Call02Icon} className="size-3.5" />
              {entry.phone}
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className={`${chip} text-state-stock-ink`}>
              <HugeiconsIcon icon={WhatsappIcon} className="size-3.5" />
              WhatsApp
            </a>
          )}
          {entry.email && (
            <a href={`mailto:${entry.email}`} className={chip}>
              <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
              {entry.email}
            </a>
          )}
          {entry.contact && <span className="break-words text-muted-foreground">{entry.contact}</span>}
        </div>
      )}
      <p className="whitespace-pre-wrap break-words">{entry.note}</p>
      {unit && all && (
        <div className="num flex items-start gap-2 border bg-muted/30 p-2.5">
          <HugeiconsIcon icon={Money03Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium">{formatCents(unit.subtotal)} <span className="font-sans text-xs font-normal text-muted-foreground">sin IVA c/u</span></p>
            <p className="font-sans text-xs text-muted-foreground">
              IVA {vatRate}%: <span className="num">{formatCents(unit.vat)}</span> · Con IVA: <span className="num font-medium text-foreground">{formatCents(unit.total)}</span> c/u
            </p>
            {quantity !== 1 && (
              <p className="font-sans text-xs text-muted-foreground">
                {quantity} u.: <span className="num">{formatCents(all.subtotal)}</span> + IVA <span className="num">{formatCents(all.vat)}</span> = <span className="num font-medium text-foreground">{formatCents(all.total)}</span>
              </p>
            )}
          </div>
        </div>
      )}
      {(entry.availability || entry.lead_time) && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground">
          {entry.availability && <div className="flex items-center gap-1.5"><dt><HugeiconsIcon icon={PackageIcon} className="size-4" /><span className="sr-only">Disponibilidad</span></dt><dd className="break-words text-foreground">{entry.availability}</dd></div>}
          {entry.lead_time && <div className="flex items-center gap-1.5"><dt><HugeiconsIcon icon={Clock01Icon} className="size-4" /><span className="sr-only">Plazo de entrega</span></dt><dd className="break-words text-foreground">{entry.lead_time}</dd></div>}
        </dl>
      )}
      {(/^https?:\/\//.test(entry.proforma_url) || entry.files.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {/^https?:\/\//.test(entry.proforma_url) && (
            <a href={entry.proforma_url} target="_blank" rel="noopener noreferrer" className={chip}>
              <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
              Ver proforma ↗
            </a>
          )}
          {entry.files.map((f) => (
            <button key={f.id} type="button" title={`${f.name} · ${formatBytes(f.size_bytes)}`} className={`${chip} max-w-full`} onClick={() => void openFile(f.id)}>
              <HugeiconsIcon icon={File01Icon} className="size-3.5 shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
