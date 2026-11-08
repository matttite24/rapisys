"use client";

import { useState } from "react";
import { ConfirmTap } from "@/components/confirm-tap";
import { FieldError } from "@/components/ui/field";

// Eliminar con el gesto de toda la app: un toque arma el botón y otro confirma. `onConfirm` ejecuta la acción del
// servidor; si falla devuelve { error } y se muestra aquí. Si tiene éxito la acción redirige.
export function ConfirmDelete({
  onConfirm,
  message = "Toca otra vez para eliminar",
  label = "Eliminar",
}: {
  onConfirm: () => Promise<{ error?: string } | undefined>;
  message?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
      <ConfirmTap
        variant="destructive"
        hint={message}
        hintSide="top"
        disabled={pending}
        onConfirm={async () => {
          setPending(true);
          try {
            const res = await onConfirm();
            setError(res?.error);
          } finally {
            setPending(false);
          }
        }}
      >
        {label}
      </ConfirmTap>
      {error && <FieldError>{error}</FieldError>}
    </span>
  );
}
