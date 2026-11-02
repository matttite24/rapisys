"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { canonicalOf, formatTyped, fromCanonical, parseTyped } from "@/lib/money-format";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "name"> & {
  name: string;
  // Valor canónico ("1250000.5": sin miles, punto decimal). Es lo que lee parseCents.
  value: string;
  onChange: (canonical: string) => void;
};

// Campo de monto: separa miles y millones con espacios mientras se escribe ("1 250 000,50") y solo
// admite números, alineado a la derecha. Al servidor viaja el valor canónico en un campo
// oculto ("1250000.50"), así que nunca se confunden miles con decimales.
export function MoneyInput({ name, value, onChange, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [text, setText] = useState(() => formatTyped(fromCanonical(value)));

  // Si el valor cambia desde fuera (otra fila, otro item), el texto lo sigue.
  // Un cambio hecho al escribir no lo toca: así se conserva la coma final ("1 250,").
  if (canonicalOf(parseTyped(text)) !== value) setText(formatTyped(fromCanonical(value)));

  // Tras reformatear, el cursor vuelve a quedar junto al dígito que se estaba escribiendo.
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Input
        {...props}
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={`text-right font-mono ${props.className ?? ""}`}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          const typed = parseTyped(raw);
          const shown = formatTyped(typed);

          const pos = e.target.selectionStart ?? raw.length;
          if (pos >= raw.length) {
            caret.current = shown.length; // se escribe al final: el cursor sigue al final
          } else {
            // En medio del número: se cuentan los dígitos a la izquierda del cursor.
            let digits = raw.slice(0, pos).replace(/\D/g, "").length;
            let i = 0;
            while (i < shown.length && digits > 0) if (/\d/.test(shown[i++])) digits--;
            caret.current = i;
          }
          setText(shown);
          onChange(canonicalOf(typed));
        }}
      />
    </>
  );
}
