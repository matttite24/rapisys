"use client";

import { PageSection } from "@/components/page-section";
import { Row, XmlReview } from "@/components/purchase-form-model";

// Lo que hay que revisar tras cargar un XML: proveedor, productos sin emparejar y cuadre contra la factura.
export function XmlReviewBar({
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
