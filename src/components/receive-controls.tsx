"use client";

import { useState, useTransition } from "react";
import { NumericInput } from "@/components/numeric-input";
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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <NumericInput
          kind="decimal"
          aria-label="Unidades que llegaron"
          className="h-8 w-20 font-mono"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Button
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              setError(undefined);
              const res = await receivePurchaseLine(org, contractId, purchaseLineId, qty);
              if (res?.error) setError(res.error);
            })
          }
        >
          {busy ? "Recibiendo…" : "Recibir"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// Recibir de una vez todo lo que falta de la factura.
export function ReceiveAll({ org, contractId, purchaseId }: { org: string; contractId: string; purchaseId: string }) {
  const [error, setError] = useState<string>();
  const [busy, startBusy] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        className="h-10"
        disabled={busy}
        onClick={() =>
          startBusy(async () => {
            setError(undefined);
            const res = await receiveAllPurchase(org, contractId, purchaseId);
            if (res?.error) setError(res.error);
          })
        }
      >
        {busy ? "Recibiendo…" : "Recibir todo lo pendiente"}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
