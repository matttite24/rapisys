import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import type { XmlInfo } from "@/lib/purchase-actions";

// Datos de la factura electrónica del SRI que se cargó (origen, autorización, comprador) y el cuadre de lo que
// suman las líneas contra los totales del XML. Lo usan la factura en edición y su detalle.
export function XmlInfoList({
  info,
  subtotalCents,
  totalCents,
}: {
  info: XmlInfo;
  subtotalCents: number;
  totalCents: number;
}) {
  const balanced = subtotalCents === info.subtotalCents && totalCents === info.totalCents;
  const dt = "font-mono text-xs text-muted-foreground";
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className={dt}>Origen</dt>
      <dd className="min-w-0 truncate">XML del SRI · {info.fileName}</dd>
      {info.authorization && (
        <>
          <dt className={dt}>N.º de autorización</dt>
          <dd className="break-all font-mono text-xs">{info.authorization}</dd>
        </>
      )}
      {info.accessKey && info.accessKey !== info.authorization && (
        <>
          <dt className={dt}>Clave de acceso</dt>
          <dd className="break-all font-mono text-xs">{info.accessKey}</dd>
        </>
      )}
      {info.authorizedAt && (
        <>
          <dt className={dt}>Autorizada</dt>
          <dd className="num">{new Date(info.authorizedAt).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" })}</dd>
        </>
      )}
      <dt className={dt}>Comprador</dt>
      <dd className="min-w-0 break-words">
        {info.buyerName} · <span className="font-mono">{info.buyerRuc}</span>
      </dd>
      <dt className={dt}>Cuadre con el XML</dt>
      <dd className={cn(!balanced && "text-destructive")}>
        {balanced
          ? `Subtotal ${formatCents(info.subtotalCents)} · Total ${formatCents(info.totalCents)} ✓`
          : `XML: ${formatCents(info.subtotalCents)} / ${formatCents(info.totalCents)} · aquí: ${formatCents(subtotalCents)} / ${formatCents(totalCents)}`}
      </dd>
    </dl>
  );
}
