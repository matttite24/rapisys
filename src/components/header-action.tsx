"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Elemento del encabezado donde las páginas colocan su acción principal.
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

type Props = {
  icon: IconSvgElement;
  label: string;
  href?: string;
  onClick?: () => void;
};

// Uso desde cualquier página: <HeaderAction icon={Add01Icon} label="Nuevo" href="…" />
// Se muestra en el encabezado de la sección como una celda al borde derecho: alto
// completo, pegada a la línea (anula el padding del encabezado). En móvil queda
// como un cuadrado con solo el ícono; el texto sigue disponible para lectores de pantalla.
export function HeaderAction({ icon, label, href, onClick }: Props) {
  const slot = useContext(HeaderSlotContext);
  if (!slot) return null;

  const className = cn(
    buttonVariants({ variant: "default" }),
    "-mr-4 h-full! border-0! bg-clip-border! px-5 max-sm:w-14 max-sm:px-0 sm:gap-2",
  );
  const content = (
    <>
      <HugeiconsIcon icon={icon} className="size-5" />
      <span className="max-sm:sr-only">{label}</span>
    </>
  );

  return createPortal(
    href ? (
      <Link href={href} data-slot="button" className={className}>
        {content}
      </Link>
    ) : (
      <Button className={className} onClick={onClick}>
        {content}
      </Button>
    ),
    slot,
  );
}
