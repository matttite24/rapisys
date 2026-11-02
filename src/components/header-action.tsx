"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Elemento del encabezado donde las páginas colocan sus acciones.
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

type Props = {
  icon: IconSvgElement;
  label: string;
  href?: string;
  onClick?: () => void;
  // Acción principal de la pantalla: botón de acento con texto (solo ícono en móvil).
  prominent?: boolean;
};

// Botón de ícono cuadrado con tooltip, para el extremo derecho de un encabezado.
export function IconAction({ icon, label, href, onClick, prominent }: Props) {
  const content = <HugeiconsIcon icon={icon} className="size-5" />;

  if (prominent) {
    // Celda al borde del encabezado: alto completo y pegada a la línea derecha
    // (anula el padding del encabezado). En móvil queda como un cuadrado de ícono.
    const className = cn(
      buttonVariants({ variant: "default" }),
      "-mr-4 h-full! border-0! bg-clip-border! px-5 max-sm:w-14 max-sm:px-0 sm:gap-2",
    );
    const text = <span className="max-sm:sr-only">{label}</span>;
    return href ? (
      <Link href={href} data-slot="button" className={className}>
        {content}
        {text}
      </Link>
    ) : (
      <Button className={className} onClick={onClick}>
        {content}
        {text}
      </Button>
    );
  }

  const className = buttonVariants({ variant: "ghost", size: "icon" });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          href ? (
            <Link href={href} aria-label={label} className={className} />
          ) : (
            <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} />
          )
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// Uso desde cualquier página: <HeaderAction icon={Add01Icon} label="Nuevo" href="…" />
// Se muestra en el encabezado de la sección, a la derecha.
export function HeaderAction(props: Props) {
  const slot = useContext(HeaderSlotContext);
  return slot ? createPortal(<IconAction {...props} />, slot) : null;
}
