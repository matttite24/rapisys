"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { digitsOnly, sanitizeDecimal } from "@/lib/numeric";

type Props = Omit<ComponentProps<typeof Input>, "type"> & {
  // "integer": solo dígitos (año, plazo, RUC). "decimal": un separador decimal (cantidades, %).
  kind?: "integer" | "decimal";
  maxDecimals?: number;
  maxLength?: number;
};

// Campo que solo admite números: cualquier otra tecla o texto pegado se descarta.
// El valor limpio se asigna antes de avisar al formulario, así que funciona
// igual con campos controlados y sin controlar.
export function NumericInput({ kind = "integer", maxDecimals = 2, maxLength, onChange, ...props }: Props) {
  return (
    <Input
      {...props}
      autoComplete="off"
      inputMode={kind === "integer" ? "numeric" : "decimal"}
      maxLength={maxLength}
      onChange={(e) => {
        const clean =
          kind === "integer" ? digitsOnly(e.target.value, maxLength) : sanitizeDecimal(e.target.value, maxDecimals);
        if (clean !== e.target.value) e.target.value = clean;
        onChange?.(e);
      }}
    />
  );
}
