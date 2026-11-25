"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { voidDelivery } from "@/lib/delivery-actions";

// Anular la entrega: pide el motivo (opcional) y confirma. Sus líneas vuelven a la bodega, listas para entregar otra vez.
export function VoidDelivery({ org, contractId, deliveryId, code }: { org: string; contractId: string; deliveryId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setError(undefined); setOpen(true); }}>
        Anular entrega
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular la entrega {code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus líneas vuelven a la bodega y quedan otra vez listas para entregar. La entrega se conserva en el historial como anulada y su número no se reutiliza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex flex-col gap-1 text-sm">
            <span className="caps text-muted-foreground">Motivo (opcional)</span>
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await voidDelivery(org, contractId, deliveryId, reason.trim());
                  if (r?.error) return setError(r.error);
                  toast.success(`Entrega ${code} anulada. Sus líneas volvieron a la bodega.`);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {busy ? "Anulando…" : "Sí, anular"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
