"use client";

import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Etiqueta de un campo; con un check verde cuando el valor viene del XML cargado.
export function XmlLabel({ text, fromXml }: { text: string; fromXml: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {fromXml && (
        <span title="Tomado del XML cargado" className="inline-flex text-foreground">
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
          <span className="sr-only">(tomado del XML)</span>
        </span>
      )}
    </span>
  );
}
