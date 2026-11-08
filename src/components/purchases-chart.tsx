"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PurchasePoint = {
  id: string;
  number: string;
  supplier: string;
  date: string; // ya formateada
  totalCents: number;
};

// Columnas con el total de cada factura cargada, de la más antigua a la más reciente. Una sola serie: sin leyenda,
// el título de la tarjeta dice qué es. Columnas de máx. 24 px con la punta redondeada, un hueco de 2 px entre ellas,
// el valor mayor rotulado y el resto en el tooltip (y en la tabla para lectores de pantalla).
export function PurchasesChart({ points }: { points: PurchasePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.totalCents), 1);
  const maxIdx = points.findIndex((p) => p.totalCents === max);
  const H = 88; // alto del área de columnas, en px

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height: H + 20 }}>
        {/* Línea base */}
        <div aria-hidden className="absolute inset-x-0 bottom-5 h-px bg-border" />
        <div className="absolute inset-x-0 bottom-5 flex items-end gap-0.5" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {points.map((p, i) => {
            const h = Math.max(4, Math.round((p.totalCents / max) * (H - 18)));
            return (
              <div
                key={p.id}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`Factura ${p.number}, ${p.supplier}, ${p.date}: ${formatCents(p.totalCents)}`}
              >
                {i === maxIdx && (
                  <span className="num absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-foreground" style={{ bottom: h + 4 }}>
                    {formatCents(p.totalCents)}
                  </span>
                )}
                <span
                  className={cn("w-full max-w-6 rounded-t-[4px] bg-foreground transition-opacity", hover !== null && hover !== i && "opacity-35")}
                  style={{ height: h }}
                />
              </div>
            );
          })}
        </div>
        {/* Fechas de los extremos */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs text-muted-foreground">
          <span>{points[0]?.date}</span>
          {points.length > 1 && <span>{points[points.length - 1].date}</span>}
        </div>
        {hover !== null && points[hover] && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-float"
            style={{ left: `${((hover + 0.5) / points.length) * 100}%`, top: 0 }}
          >
            <span className="num block font-medium">{points[hover].number}</span>
            <span className="block text-muted-foreground">{points[hover].supplier}</span>
            <span className="num block">{formatCents(points[hover].totalCents)}</span>
          </div>
        )}
      </div>
      {/* Vista en tabla, para lectores de pantalla. */}
      <table className="sr-only">
        <caption>Total de cada factura cargada</caption>
        <thead>
          <tr>
            <th>Factura</th>
            <th>Proveedor</th>
            <th>Fecha</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <td>{p.number}</td>
              <td>{p.supplier}</td>
              <td>{p.date}</td>
              <td>{formatCents(p.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
