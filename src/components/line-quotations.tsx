"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelLoading } from "@/components/panel-loading";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { addQuotation, listQuotations, type Quotation } from "@/lib/quotation-actions";
import { formatCents } from "@/lib/money";

const date = (value: string) => new Date(value).toLocaleString("es-EC", {
  timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function LineQuotations({ org, contractId, lineId, canAct, onSaved }: {
  org: string; contractId: string; lineId: string; canAct: boolean; onSaved: () => Promise<void>;
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
      toast.success("Gestión guardada en el historial.");
      if (mounted.current) {
        form.reset(); setEditing(false); setRows(null); setMore(false); setError(""); setRetry((n) => n + 1);
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
            <div className="grid grid-cols-2 gap-3">
              <FormField name="supplier" label="Proveedor">{(props) => <Input {...props} maxLength={200} placeholder="Nombre o empresa" />}</FormField>
              <FormField name="contact" label="Contacto">{(props) => <Input {...props} maxLength={300} placeholder="Teléfono o correo" />}</FormField>
            </div>
            <FormField name="note" label="Gestión y siguiente paso" hint="Puedes registrar una llamada aunque todavía no tengas precio.">{(props) => (
              <Textarea {...props} required autoFocus maxLength={5000} rows={3} placeholder="Llamé al proveedor. Confirmará disponibilidad mañana…" />
            )}</FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField name="unitCost" label="Precio unitario (USD)" hint="Opcional, sin IVA">{(props) => <NumericInput {...props} kind="decimal" placeholder="0,00" />}</FormField>
              <FormField name="availability" label="Disponibilidad">{(props) => <Input {...props} maxLength={300} placeholder="Por confirmar, 2 unidades…" />}</FormField>
            </div>
            <FormField name="leadTime" label="Plazo de entrega">{(props) => <Input {...props} maxLength={300} placeholder="Entrega inmediata, 5 días…" />}</FormField>
            <FormField name="proformaUrl" label="Enlace a proforma" hint="Enlace al documento, carpeta o conversación.">{(props) => <Input {...props} type="url" maxLength={2000} placeholder="https://…" />}</FormField>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditing(false); setFormError(""); }}>Cancelar</Button>
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
          <li key={entry.id} className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{entry.supplier || "Gestión de búsqueda"}</span>
              <time dateTime={entry.created_at} className="font-mono text-xs text-muted-foreground">{date(entry.created_at)}</time>
            </div>
            {entry.contact && <p className="break-words text-muted-foreground">{entry.contact}</p>}
            <p className="whitespace-pre-wrap break-words">{entry.note}</p>
            <dl className="grid grid-cols-2 gap-3">
              {entry.unit_cost_cents !== null && <div><dt className="text-xs text-muted-foreground">Precio unitario sin IVA</dt><dd className="num font-medium">{formatCents(entry.unit_cost_cents)}</dd></div>}
              {entry.availability && <div><dt className="text-xs text-muted-foreground">Disponibilidad</dt><dd className="break-words">{entry.availability}</dd></div>}
              {entry.lead_time && <div><dt className="text-xs text-muted-foreground">Plazo de entrega</dt><dd className="break-words">{entry.lead_time}</dd></div>}
            </dl>
            {/^https?:\/\//.test(entry.proforma_url) && <a href={entry.proforma_url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">Ver proforma ↗</a>}
          </li>
        ))}
      </ol>
      {more && <div className="p-4"><Button variant="outline" className="w-full" disabled={loading} onClick={loadMore}>{loading ? "Cargando…" : "Ver gestiones anteriores"}</Button></div>}
    </div>
  );
}
