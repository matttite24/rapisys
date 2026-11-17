"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  draft = false,
}: {
  org: string;
  contractId: string;
  purchaseId: string;
  invoice: string;
  draft?: boolean; // un borrador se descarta: no tiene asignaciones ni productos creados
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        variant="ghost"
        className="h-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        {draft ? "Eliminar borrador" : "Eliminar factura"}
      </Button>
      {error && <FieldError>{error}</FieldError>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {draft ? "el borrador" : "la factura"} {invoice}?</AlertDialogTitle>
            <AlertDialogDescription>
              {draft
                ? "Se descarta el borrador con todas sus líneas. No se crea ni se cambia ningún producto de la bodega. Esta acción no se puede deshacer."
                : "Se quitan sus líneas y lo que se había reservado para líneas del proceso. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const res = await deletePurchase(org, contractId, purchaseId);
                if (res?.error) setError(res.error);
                else {
                  toast.success(draft ? "Borrador eliminado." : "Factura eliminada.");
                  router.push(`/${org}/contratos/${contractId}/compras`);
                }
              }}
            >
              {draft ? "Sí, eliminar borrador" : "Sí, eliminar factura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
