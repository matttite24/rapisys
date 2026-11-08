"use client";

import { useEffect, useState, useTransition } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import { PageShortcuts, useModKey } from "@/components/page-shortcuts";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { receiveAllPurchase, receivePurchaseLine } from "@/lib/purchase-actions";

// Recepción de una línea de factura: cuánto llegó (por defecto, todo lo que falta).
export function ReceiveLine({
  org,
  contractId,
  purchaseLineId,
  pending,
}: {
  org: string;
  contractId: string;
  purchaseLineId: string;
  pending: number;
}) {
  const [qty, setQty] = useState(String(pending));
  const [error, setError] = useState<string>();
  const [busy, startBusy] = useTransition();

  function submit() {
    if (busy) return;
    startBusy(async () => {
      setError(undefined);
      const res = await receivePurchaseLine(org, contractId, purchaseLineId, qty);
      if (res?.error) setError(res.error);
    });
  }

  // Enter recibe la línea; ↑/↓ pasan a la casilla de la línea de arriba o abajo.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const all = [...document.querySelectorAll<HTMLInputElement>("[data-receive]")];
      const next = all[all.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)];
      next?.focus();
      next?.select();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <NumericInput
          kind="decimal"
          data-receive=""
          aria-label="Unidades que llegaron"
          className="h-10 w-20 font-mono lg:h-7 lg:w-16"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button
          size="sm"
          className="h-10 px-4 lg:h-7 lg:px-3"
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Recibiendo…" : "Recibir"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// Recibir de una vez todo lo que falta de la factura. Va en el encabezado de la sección (como celda al borde
// derecho, igual que las demás acciones principales); el error sale como aviso.
export function ReceiveAll({ org, contractId, purchaseId }: { org: string; contractId: string; purchaseId: string }) {
  const [busy, startBusy] = useTransition();

  function run() {
    startBusy(async () => {
      const res = await receiveAllPurchase(org, contractId, purchaseId);
      if (res?.error) toast.error(res.error);
      else toast.success("Todo lo pendiente quedó recibido.");
    });
  }

  // Ctrl/⌘+Enter recibe todo lo pendiente (igual que Completar en la factura).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (!busy) run();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <Button
      size="sm"
      className="gap-2 px-3"
      disabled={busy}
      onClick={run}
    >
      <HugeiconsIcon icon={Tick02Icon} className="size-4" />
      {busy ? "Recibiendo…" : "Recibir todo lo pendiente"}
    </Button>
  );
}

// Atajos de la pantalla de recibir, para la barra de abajo (los atiende cada control).
export function ReceiveShortcuts({ canReceive }: { canReceive: boolean }) {
  const modKey = useModKey();
  return (
    <PageShortcuts
      shortcuts={
        canReceive
          ? [
              { keys: [modKey, "↵"], label: "Recibir todo" },
              { keys: ["↵"], label: "Recibir la línea" },
              { keys: ["↑", "↓"], label: "Cambiar de línea" },
            ]
          : []
      }
    />
  );
}
