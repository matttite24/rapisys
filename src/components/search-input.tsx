"use client";

import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Búsqueda única del sistema: lupa de la marca, campo de texto, "x" del sistema para borrar y, opcionalmente, algo a la
// derecha (por ejemplo, una acción). Dos formas:
//  · "row"   (por defecto): fila de barra de herramientas, sin borde, que llena el alto de su contenedor.
//  · "field": campo con caja completa, como el resto de los campos de un formulario, diálogo o selector.
// Puede ser controlado (`value` + `onChange`) o no (`defaultValue`). `onChange` avisa en cada tecla; `onSearch` avisa con
// el texto recortado cuando se deja de escribir (`delay` ms) y al instante al borrar: es el que va a la red o a la URL.
export function SearchInput({
  label,
  value,
  defaultValue = "",
  onChange,
  onSearch,
  delay = 350,
  variant = "row",
  placeholder,
  autoFocus,
  name,
  id,
  className,
  inputClassName,
  onKeyDown,
  children,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  delay?: number;
  variant?: "row" | "field";
  placeholder?: string;
  autoFocus?: boolean;
  name?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  children?: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const row = variant === "row";
  useEffect(() => () => clearTimeout(timer.current), []);

  function change(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
    if (onSearch) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onSearch(next.trim()), delay);
    }
  }

  function clear() {
    clearTimeout(timer.current);
    if (value === undefined) setInner("");
    onChange?.("");
    onSearch?.("");
  }

  const common = {
    id,
    name,
    // Texto y no "search": el tipo "search" trae su propia "x" del navegador y aquí hay una del sistema.
    type: "text" as const,
    role: "searchbox",
    inputMode: "search" as const,
    "aria-label": label,
    placeholder,
    autoComplete: "off",
    autoFocus,
    value: text,
    onKeyDown,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => change(e.target.value),
  };

  return (
    <div className={cn("relative flex min-w-0 flex-1 items-center", row && "h-full", className)}>
      <HugeiconsIcon
        icon={Search01Icon}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-foreground",
          row ? "left-6 size-5" : "left-3 size-4",
        )}
      />
      {row ? (
        <input
          {...common}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent pr-2 pl-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background",
            inputClassName,
          )}
        />
      ) : (
        // El kit define padding-inline fuera de @layer; las utilidades importantes reservan
        // el espacio de los iconos incluso con esas reglas globales.
        <Input {...common} className={cn("pl-9! pr-10!", inputClassName)} />
      )}
      {text && (
        <button
          type="button"
          aria-label="Borrar la búsqueda"
          onClick={clear}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
            row ? (children ? "" : "mr-3") : "absolute top-1/2 right-1 -translate-y-1/2",
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      )}
      {children && <div className="flex shrink-0 items-center pr-2">{children}</div>}
    </div>
  );
}
