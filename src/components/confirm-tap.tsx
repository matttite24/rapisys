"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Gesto de confirmación de toda la app: se toca una vez para armar y otra para confirmar. Armado, el botón se pone rojo y un
// aviso flotante dice qué pasará al tocar otra vez; el aviso no ocupa lugar, así que nada se mueve. Se desarma solo a los
// 3 s, al perder el foco o con Esc.
export function ConfirmTap({
  onConfirm,
  hint = "Toca otra vez para confirmar",
  hintSide = "left",
  disabled,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "onBlur" | "onKeyDown"> & {
  onConfirm: () => void;
  hint?: string;
  // Dónde sale el aviso: a la izquierda del botón (íconos en filas) o encima (botones con texto).
  hintSide?: "left" | "top";
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        {...props}
        disabled={disabled}
        className={cn(className, armed && "border-transparent bg-destructive text-white hover:bg-destructive hover:text-white focus-visible:text-white")}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onConfirm();
        }}
        onBlur={() => setArmed(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setArmed(false);
        }}
      >
        {children}
      </Button>
      {armed && (
        <span
          role="status"
          className={cn(
            "pointer-events-none absolute z-10 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-float",
            hintSide === "left" ? "top-1/2 right-full mr-2 -translate-y-1/2" : "right-0 bottom-full mb-2",
          )}
        >
          {hint}
        </span>
      )}
    </span>
  );
}
