"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateDelivery } from "@/lib/delivery-actions";

// Corregir una entrega ya registrada: la fecha (si salió a entregar y no la recibieron, se reprograma), quién recibe y las notas.
export function EditDelivery({
  org, contractId, deliveryId, code, date: initialDate, receivedBy: initialReceived, notes: initialNotes,
}: {
  org: string; contractId: string; deliveryId: string; code: string; date: string; receivedBy: string; notes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [receivedBy, setReceivedBy] = useState(initialReceived);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  function show() {
    setDate(initialDate);
    setReceivedBy(initialReceived);
    setNotes(initialNotes);
    setError(undefined);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={show}>
        <HugeiconsIcon icon={Edit02Icon} className="size-4" />
        Editar
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar la entrega {code}</DialogTitle>
            <DialogDescription>
              Cambia la fecha si la entrega se reprogramó (por ejemplo, salieron a entregar y no la recibieron), o corrige quién recibe y las notas. Las líneas no cambian.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField name="edit_delivery_date" label="Fecha de entrega">
              {(a11y) => <DatePicker {...a11y} name="edit_delivery_date" value={date} onChange={setDate} />}
            </FormField>
            <FormField name="edit_received_by" label="Recibe (opcional)">
              {(a11y) => <Input {...a11y} autoComplete="off" maxLength={200} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />}
            </FormField>
            <FormField name="edit_notes" label="Notas (opcional)">
              {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </FormField>
            {error && <FieldError>{error}</FieldError>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={busy || !date}
              onClick={() =>
                start(async () => {
                  const r = await updateDelivery(org, contractId, deliveryId, { date, receivedBy: receivedBy.trim(), notes: notes.trim() });
                  if (r?.error) return setError(r.error);
                  toast.success(`Entrega ${code} actualizada.`);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
