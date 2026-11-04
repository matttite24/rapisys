"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { deletePurchase } from "@/lib/purchase-actions";

// Eliminar una factura que aún no se recibió, con confirmación.
export function DeletePurchase({
  org,
  contractId,
  purchaseId,
  invoice,
}: {
  org: string;
  contractId: string;
  purchaseId: string;
  invoice: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        variant="ghost"
        className="h-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        Eliminar factura
      </Button>
      {error && <FieldError>{error}</FieldError>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la factura {invoice}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitan sus líneas y lo que se había asignado a líneas del contrato. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const res = await deletePurchase(org, contractId, purchaseId);
                if (res?.error) setError(res.error);
                else router.push(`/${org}/contratos/${contractId}/compras`);
              }}
            >
              Sí, eliminar factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
