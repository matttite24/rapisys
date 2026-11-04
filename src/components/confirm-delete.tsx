"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

// Eliminar en dos pasos, sin diálogos del navegador. `onConfirm` ejecuta la acción
// del servidor; si falla devuelve { error } y se muestra aquí. Si tiene éxito la
// acción redirige, así que no hay nada más que hacer.
export function ConfirmDelete({
  onConfirm,
  message = "¿Eliminar definitivamente?",
}: {
  onConfirm: () => Promise<{ error?: string } | undefined>;
  message?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        className="min-h-11 sm:ml-auto sm:min-h-10"
        onClick={() => setConfirming(true)}
      >
        Eliminar
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
      <span className="text-sm">{message}</span>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        className="min-h-11 sm:min-h-10"
        onClick={async () => {
          setPending(true);
          try {
            const res = await onConfirm();
            setError(res?.error);
            if (res?.error) setConfirming(false);
          } finally {
            setPending(false);
          }
        }}
      >
        Sí, eliminar
      </Button>
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setConfirming(false)}>
        No
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </span>
  );
}
