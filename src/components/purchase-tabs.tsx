"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// Dos pestañas en la factura: sus datos (líneas, recepción, totales) y sus pagos. Las dos se arman en el servidor; aquí solo
// se elige cuál se ve. La elegida viaja en la URL (?vista=pagos) para que recargar o compartir el enlace la conserve.
export function PurchaseTabs({
  invoice,
  payments,
  paymentsCount,
  actions,
}: {
  invoice: React.ReactNode;
  payments: React.ReactNode;
  paymentsCount: number;
  // Acciones de la factura, a la derecha de las pestañas (solo con la pestaña Factura abierta).
  actions?: React.ReactNode;
}) {
  const search = useSearchParams();
  const [tab, setTab] = useState<"factura" | "pagos">(search.get("vista") === "pagos" ? "pagos" : "factura");

  function pick(next: "factura" | "pagos") {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "pagos") url.searchParams.set("vista", "pagos");
    else url.searchParams.delete("vista");
    window.history.replaceState(null, "", url);
  }

  const items = [
    { key: "factura", label: "Factura" },
    { key: "pagos", label: "Pagos", count: paymentsCount },
  ] as const;

  return (
    <>
      <div className="flex items-stretch justify-between gap-3 border-b bg-surface-strong/60 pr-3">
      <div role="tablist" aria-label="Secciones de la factura" className="flex">
        {items.map((i) => (
          <button
            key={i.key}
            type="button"
            role="tab"
            id={`purchase-tab-${i.key}`}
            aria-selected={tab === i.key}
            aria-controls={`purchase-panel-${i.key}`}
            onClick={() => pick(i.key)}
            className={cn(
              "-mb-px flex h-11 items-center gap-2 border-b-2 px-5 text-sm transition-colors",
              tab === i.key ? "border-b-brand font-bold text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {i.label}
            {"count" in i && i.count > 0 && <span className="num bg-muted px-1.5 py-0.5 text-2xs leading-none text-muted-foreground">{i.count}</span>}
          </button>
        ))}
      </div>
      {tab === "factura" && actions && <div className="flex items-center">{actions}</div>}
      </div>
      <div role="tabpanel" id="purchase-panel-factura" aria-labelledby="purchase-tab-factura" hidden={tab !== "factura"}>{invoice}</div>
      <div role="tabpanel" id="purchase-panel-pagos" aria-labelledby="purchase-tab-pagos" hidden={tab !== "pagos"}>{payments}</div>
    </>
  );
}
