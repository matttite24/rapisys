"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Cancel01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { ExportColumnsDialog } from "@/components/export-columns-dialog";
import { HeaderAction } from "@/components/header-action";
import { PageSection } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { billingRow, billingTotals } from "@/lib/billing";
import { saveBillingAdjustments, type BillingChange } from "@/lib/billing-actions";
import { formatCents, parseDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";

export type BillingLine = {
  id: string;
  description: string;
  part_number: string | null;
  quantity: number;
  unit: string;
  referenceCents: number | null;
  costCents: number;
  unknown: number;
  sources: number;
  marginOverride: number | null;
  excluded: boolean;
};
export type BillingServerTotals = { cost_cents: number; final_cents: number; included: number; excluded: number; uncalculated: number };

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1).replace(".", ",")}%`);

// Reporte de cobro de una entrega: se eligen filas con el check para cambiar su margen o omitirlas del cálculo. Los ajustes se
// guardan aparte (no cambian precios, márgenes de productos ni las demás pestañas) y alimentan el reporte de cobro.
export function BillingTable({
  org, contractId, deliveryId, listId, base, lines, total, totals, page, tab, canEdit, title, subtitle, warnings,
}: {
  org: string; contractId: string; deliveryId: string; listId: string; base: string;
  lines: BillingLine[]; total: number; totals: BillingServerTotals; page: number; tab: string; canEdit: boolean;
  title: string; subtitle: string; warnings: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Ajustes de la página, en pantalla al instante; el servidor confirma y refresca.
  const [local, setLocal] = useState<Record<string, { margin: number | null; excluded: boolean }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMargin, setBulkMargin] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const view = lines.map((l) => {
    const adj = local[l.id] ?? { margin: l.marginOverride, excluded: l.excluded };
    const calc = billingRow({ costCents: l.costCents, referenceCents: l.referenceCents, sources: l.sources, marginOverride: adj.margin, excluded: adj.excluded });
    return { l, adj, calc };
  });
  const pageTotals = useMemo(() => billingTotals(view.map((v) => ({ cost: v.l.costCents, row: v.calc }))), [view]);
  const allSelected = lines.length > 0 && lines.every((l) => selected.has(l.id));

  function save(changes: BillingChange[]) {
    setLocal((cur) => ({ ...cur, ...Object.fromEntries(changes.map((c) => [c.lineId, { margin: c.margin, excluded: c.excluded }])) }));
    start(async () => {
      const r = await saveBillingAdjustments(org, contractId, deliveryId, changes);
      if (r.error) { toast.error(r.error); setLocal({}); }
      router.refresh();
    });
  }
  const current = (id: string) => view.find((v) => v.l.id === id)!.adj;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const ids = [...selected];
  // Cierra la edición masiva: quita las marcas y limpia el margen escrito.
  function closeBulk() {
    setSelected(new Set());
    setBulkMargin("");
  }
  const hasSelection = ids.length > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setSelected(new Set());
      setBulkMargin("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasSelection]);

  function applyMargin() {
    const m = parseDecimal(bulkMargin);
    if (m === null || m < 0 || m > 1000) return void toast.error("Escribe un margen entre 0 y 1000, con máximo 2 decimales.");
    save(ids.map((id) => ({ lineId: id, margin: m, excluded: current(id).excluded })));
  }

  const strip = "flex min-w-0 flex-col gap-1";
  return (
    <PageSection
      label={title}
      meta={subtitle}
      className="p-0"
    >
      {/* Descarga el reporte de cobro de la entrega ya revisada (todas sus líneas, con los ajustes), en Excel. */}
      <HeaderAction icon={Download01Icon} label="Exportar" title="Exportar el reporte de cobro de esta entrega a Excel" secondary onClick={() => setExportOpen(true)} />
      <ExportColumnsDialog open={exportOpen} onOpenChange={setExportOpen} href={`${base}/revision/entrega/${deliveryId}/excel`} />
      {/* Totales de TODAS las líneas incluidas de la entrega (no solo de esta página). */}
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-5 [&>div]:bg-background [&>div]:p-4">
        <div className={strip}><dt className="caps text-muted-foreground" title="Lo realmente pagado por lo asignado, con IVA">Costo total</dt><dd className="num font-mono text-lg">{formatCents(totals.cost_cents)}</dd></div>
        <div className={strip}><dt className="caps text-muted-foreground" title="Precio ref. de cada línea, o costo × (1 + margen) en las que cambiaste el margen">Valor final</dt><dd className="num font-mono text-lg">{formatCents(totals.final_cents)}</dd></div>
        <div className={strip}>
          <dt className="caps text-muted-foreground" title="Valor final − costo total">Utilidad generada</dt>
          <dd className={cn("num font-mono text-lg font-semibold", totals.final_cents - totals.cost_cents < 0 && "text-destructive")}>{formatCents(totals.final_cents - totals.cost_cents)}</dd>
        </div>
        <div className={strip}>
          <dt className="caps text-muted-foreground" title="Utilidad generada ÷ costo total">Margen aplicado</dt>
          <dd className="num font-mono text-lg">{pct(totals.cost_cents > 0 ? ((totals.final_cents - totals.cost_cents) / totals.cost_cents) * 100 : null)}</dd>
        </div>
        <div className={strip}>
          <dt className="caps text-muted-foreground">Líneas</dt>
          <dd className="num font-mono text-lg">{totals.included} <span className="text-xs text-muted-foreground">incluidas{totals.excluded > 0 ? ` · ${totals.excluded} omitidas` : ""}{totals.uncalculated > 0 ? ` · ${totals.uncalculated} sin calcular` : ""}</span></dd>
        </div>
      </dl>

      {warnings.length > 0 && <p className="border-b px-4 py-2 text-xs text-muted-foreground">{warnings.join(" · ")}.</p>}

      {/* Edición masiva: aparece al marcar filas y se cierra con la X, con Esc o desmarcando todo. */}
      {canEdit && ids.length > 0 && (
        <div role="region" aria-label="Edición masiva de las filas marcadas" className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-4 py-2 text-sm">
          <span className="num font-medium">{ids.length} {ids.length === 1 ? "fila marcada" : "filas marcadas"}</span>
          <label className="flex items-center gap-2">
            Margen %
            <Input aria-label="Margen para las filas marcadas" inputMode="decimal" className="h-8 w-20 bg-background text-right font-mono" placeholder="40" value={bulkMargin} onChange={(e) => setBulkMargin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyMargin(); } }} />
          </label>
          <Button size="sm" disabled={pending} onClick={applyMargin}>Aplicar margen</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => save(ids.map((id) => ({ lineId: id, margin: current(id).margin, excluded: true })))}>Omitir del cálculo</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => save(ids.map((id) => ({ lineId: id, margin: current(id).margin, excluded: false })))}>Incluir</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(ids.map((id) => ({ lineId: id, margin: null, excluded: false })))}>Restablecer</Button>
          <Button size="icon" variant="ghost" className="ml-auto size-8" aria-label="Cerrar edición masiva (Esc)" title="Cerrar (Esc)" onClick={closeBulk}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Esta entrega aún no tiene líneas.</p>
      ) : (
        <Table aria-busy={pending}>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              {canEdit && (
                <TableHead className="w-px">
                  <input type="checkbox" className="size-4" aria-label="Marcar todas las filas de la página" title="Marca filas para cambiar su margen u omitirlas" checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(lines.map((l) => l.id)))} />
                </TableHead>
              )}
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right" title="Lo realmente pagado por lo asignado a la línea, con IVA">Costo total</TableHead>
              <TableHead className="text-right" title="Utilidad ÷ costo total. Se puede cambiar en cada fila.">Margen aplicado</TableHead>
              <TableHead className="text-right" title="Precio ref. de la línea, o costo × (1 + margen) si el margen se cambió">Valor final</TableHead>
              <TableHead className="text-right" title="Valor final − costo total">Utilidad generada</TableHead>
              {canEdit && <TableHead className="w-px">Incluida</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map(({ l, adj, calc }) => {
              const dim = adj.excluded;
              const done = calc.profitCents !== null;
              const fix = `${base}/abastecimiento?${new URLSearchParams({ lista: listId, q: l.part_number || l.description })}`;
              return (
                <TableRow key={l.id} className={cn("hover:bg-accent/40", dim && "text-muted-foreground")} data-excluded={dim || undefined}>
                  {canEdit && (
                    <TableCell>
                      <input type="checkbox" className="size-4" aria-label={`Marcar ${l.description}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    </TableCell>
                  )}
                  <TableCell className={cn("min-w-56", dim && "line-through decoration-muted-foreground/40")}>
                    <Link href={fix} className="underline-offset-4 hover:underline" title="Ajustar en Abastecimiento">{l.description}</Link>
                    {l.part_number && <p className="font-mono text-xs text-muted-foreground">{l.part_number}</p>}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{l.quantity} {l.unit}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{l.sources > 0 ? formatCents(l.costCents) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && l.sources > 0 ? (
                      <MarginInput
                        key={`${l.id}:${adj.margin ?? "auto"}:${calc.marginPct?.toFixed(2) ?? ""}`}
                        value={adj.margin}
                        shown={calc.marginPct}
                        disabled={pending}
                        onCommit={(m) => save([{ lineId: l.id, margin: m, excluded: adj.excluded }])}
                      />
                    ) : (
                      <span className="num">{pct(calc.marginPct)}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn("num whitespace-nowrap text-right", adj.margin !== null && "font-medium")}>{calc.finalCents === null ? "—" : formatCents(calc.finalCents)}</TableCell>
                  <TableCell className={cn("num whitespace-nowrap text-right font-medium", done && calc.profitCents! < 0 && !dim && "text-destructive")}>
                    {done ? formatCents(calc.profitCents!) : <span className="text-xs font-normal text-muted-foreground">{l.sources === 0 ? "Sin compra" : "Sin valor final"}</span>}
                    {l.unknown > 0 && <span className="block text-xs font-normal text-muted-foreground">Costo incompleto</span>}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <input type="checkbox" className="size-4" aria-label={`${adj.excluded ? "Incluir" : "Omitir"} ${l.description} en el cálculo`} checked={!adj.excluded}
                        onChange={() => save([{ lineId: l.id, margin: adj.margin, excluded: !adj.excluded }])} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {lines.length > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Esta página: costo {formatCents(pageTotals.cost)} · valor final {formatCents(pageTotals.final)} · utilidad {formatCents(pageTotals.profit)}. Los ajustes solo afectan al reporte de cobro.
        </p>
      )}
      <Pager basePath={`${base}/revision`} page={page} total={total} size={50} params={{ pestana: tab }} />
    </PageSection>
  );
}

// Margen de una fila: muestra el real (atenuado) o el ajustado (resaltado); se confirma al salir del campo o con Enter.
// Vaciarlo vuelve al valor final original.
function MarginInput({ value, shown, disabled, onCommit }: { value: number | null; shown: number | null; disabled: boolean; onCommit: (m: number | null) => void }) {
  const [text, setText] = useState(value !== null ? String(value) : "");
  function commit() {
    const t = text.trim();
    if (t === "") return value === null ? undefined : onCommit(null);
    const m = parseDecimal(t);
    if (m === null || m < 0 || m > 1000) { toast.error("Margen entre 0 y 1000, con máximo 2 decimales."); setText(value !== null ? String(value) : ""); return; }
    if (m !== value) onCommit(m);
  }
  return (
    <Input
      aria-label="Margen aplicado"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      placeholder={shown === null ? "—" : shown.toFixed(1).replace(".", ",")}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      className={cn("ml-auto h-8 w-20 text-right font-mono", value === null && "placeholder:text-foreground/70")}
    />
  );
}
