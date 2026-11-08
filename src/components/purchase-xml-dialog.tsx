"use client";

import { useRef, useState } from "react";
import { Cancel01Icon, File01Icon } from "@hugeicons/core-free-icons";
import { CELL_ROW } from "@/components/cell-header";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCents, vatOf } from "@/lib/money";
import { matchXmlLines, type XmlLineMatch } from "@/lib/purchase-actions";
import { parseSriXml, type SriInvoice } from "@/lib/sri-xml";
import { cn } from "@/lib/utils";

export type XmlLoaded = {
  invoice: SriInvoice;
  fileName: string;
  supplier: { id: string; name: string } | null;
  matches: XmlLineMatch[];
};

// Modal para cargar el XML del SRI y verificarlo antes de llenar la factura. Lee el archivo en el navegador;
// nada se guarda hasta que la factura se guarda.
type Props = {
  org: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacing: number; // líneas que hay hoy en la factura y se reemplazarían
  onApply: (loaded: XmlLoaded) => void;
};

// Se deja montado y se controla con `open` para que abra y cierre con animación; el contenido se desmonta al
// cerrar, así cada apertura empieza limpia.
export function XmlLoadDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <XmlLoadBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function XmlLoadBody({ org, onOpenChange, replacing, onApply }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<XmlLoaded>();
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function read(f: File) {
    setError(undefined);
    setLoaded(undefined);
    setReading(true);
    try {
      const parsed = parseSriXml(await f.text());
      if (!parsed.ok) return setError(parsed.error);
      const inv = parsed.invoice;
      const m = await matchXmlLines(org, {
        supplierRuc: inv.supplier.ruc,
        lines: inv.lines.map((l) => ({ code: l.code, description: l.description })),
      });
      if (!m) return setError("No se pudo leer la factura. Inténtalo de nuevo.");
      setLoaded({ invoice: inv, fileName: f.name, supplier: m.supplier, matches: m.lines });
    } catch {
      setError("No se pudo leer el archivo.");
    } finally {
      setReading(false);
    }
  }

  const inv = loaded?.invoice;
  const matched = loaded ? loaded.matches.filter((m) => m.item).length : 0;
  const byText = loaded ? loaded.matches.filter((m) => m.how === "description").length : 0;
  const subtotal = inv ? inv.lines.reduce((s, l) => s + l.totalCents, 0) : 0;
  const total = inv ? subtotal + inv.lines.reduce((s, l) => s + vatOf(l.totalCents, l.vat), 0) : 0;
  const balanced = !!inv && subtotal === inv.subtotalCents && total === inv.totalCents;

  return (
    <>
        <DialogHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4")}>
          <DialogTitle className="caps-md font-medium">Cargar XML del SRI</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon" aria-label="Cerrar carga de XML" />}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </DialogClose>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
        <DialogDescription className="px-4 pt-4 text-sm">Revisa el archivo antes de llenar la factura. Nada se guarda todavía.</DialogDescription>
        <div className="p-4">
        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-brand bg-accent" : "border-input bg-muted/20",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !reading) void read(f);
          }}
        >
          <input
            ref={input}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void read(f);
            }}
          />
          <Button type="button" variant="outline" className="gap-2" disabled={reading} onClick={() => input.current?.click()}>
            <HugeiconsIcon icon={File01Icon} className="size-4" />
            {reading ? "Leyendo…" : loaded ? "Elegir otro archivo" : "Elegir archivo XML"}
          </Button>
          <p className="max-w-full break-words text-sm text-muted-foreground" role="status">
            {loaded ? loaded.fileName : "o arrastra aquí el XML (el comprobante o el autorizado que descargas del SRI)"}
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        </div>

        {loaded && inv && (
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-t p-4 text-sm">
            <Row label="Factura">
              <span className="font-mono">{inv.number}</span> · {inv.date.split("-").reverse().join("/")}
            </Row>
            <Row label="Proveedor">
              {loaded.supplier ? (
                <>{loaded.supplier.name} ✓</>
              ) : (
                <span className="text-destructive">
                  {inv.supplier.name} (RUC {inv.supplier.ruc}) no existe en Proveedores. Podrás crearlo y elegirlo después.
                </span>
              )}
            </Row>
            <Row label="Comprador">
              {inv.buyer.name} · {inv.buyer.ruc}
            </Row>
            <Row label="Productos">
              {matched === inv.lines.length ? (
                <>Las {inv.lines.length} líneas tienen producto ✓</>
              ) : (
                <span className="text-destructive">
                  {inv.lines.length - matched} de {inv.lines.length} líneas sin producto: las resuelves en la factura.
                </span>
              )}
              {byText > 0 && <span className="block text-muted-foreground">{byText} se hallaron por un número de parte en la descripción.</span>}
            </Row>
            <Row label="Cuadre">
              {balanced ? (
                <>Subtotal {formatCents(inv.subtotalCents)} · Total {formatCents(inv.totalCents)} — coincide con el XML ✓</>
              ) : (
                <span className="text-destructive">
                  El XML dice subtotal {formatCents(inv.subtotalCents)} y total {formatCents(inv.totalCents)}; las líneas suman{" "}
                  {formatCents(subtotal)} y {formatCents(total)}.
                </span>
              )}
            </Row>
          </dl>
        )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/20 p-4">
          {replacing > 0 && <p className="mr-auto self-center text-sm text-muted-foreground">Reemplaza las {replacing} líneas actuales.</p>}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!loaded || reading}
            onClick={() => {
              if (loaded) onApply(loaded);
              onOpenChange(false);
            }}
          >
            Llenar la factura
          </Button>
        </DialogFooter>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="caps text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
