"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageNewActionContext } from "@/components/page-shortcuts";
import { cn } from "@/lib/utils";

// Elemento del encabezado donde las páginas colocan su acción principal.
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

type Props = {
  icon: IconSvgElement;
  label: string;
  href?: string;
  onClick?: () => void;
  // Botón presente pero aún sin función: se ve inactivo y explica por qué.
  disabled?: boolean;
  title?: string;
  // Acción secundaria junto a la principal: sin atajo Alt + N y con estilo neutro.
  secondary?: boolean;
  // El enlace descarga un archivo (no navega dentro de la app).
  download?: boolean;
};

// Uso desde cualquier página: <HeaderAction icon={Add01Icon} label="Nuevo" href="…" />
// Se muestra en el encabezado de la sección como una celda al borde derecho: alto
// completo, pegada a la línea (anula el padding del encabezado). En móvil queda
// como un cuadrado con solo el ícono; el texto sigue disponible para lectores de pantalla.
export function HeaderAction({ icon, label, href, onClick, disabled, title, secondary, download }: Props) {
  const slot = useContext(HeaderSlotContext);
  const router = useRouter();
  const registerNew = useContext(PageNewActionContext);
  const usable = !disabled && !secondary && (Boolean(href) || Boolean(onClick));

  // Atajo general para crear: Alt + N (y Ctrl/⌘ + N donde el navegador lo deje pasar; Chrome, Safari y Firefox lo
  // reservan para "nueva ventana", así que Alt + N es el que siempre funciona).
  useEffect(() => {
    if (!usable) return;
    registerNew(label);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyN" || e.shiftKey) return;
      const combo = e.altKey ? !e.ctrlKey && !e.metaKey : e.ctrlKey || e.metaKey;
      if (!combo) return;
      e.preventDefault();
      if (href) router.push(href);
      else onClick?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      registerNew(null);
    };
  }, [usable, label, href, onClick, router, registerNew]);

  if (!slot) return null;

  const className = cn(
    buttonVariants({ variant: secondary ? "ghost" : "brand" }),
    "h-full! rounded-none! border-0! bg-clip-border! px-5 max-sm:w-14 max-sm:px-0 sm:gap-2",
    !secondary && "-mr-4",
  );
  const content = (
    <>
      <HugeiconsIcon icon={icon} className="size-5" />
      <span className="max-sm:sr-only">{label}</span>
    </>
  );

  return createPortal(
    href && !disabled && download ? (
      <a href={href} download data-slot="button" className={className} title={title}>
        {content}
      </a>
    ) : href && !disabled ? (
      <Link href={href} data-slot="button" className={className}>
        {content}
      </Link>
    ) : (
      <Button variant={secondary ? "ghost" : "brand"} className={className} onClick={onClick} disabled={disabled} title={title}>
        {content}
      </Button>
    ),
    slot,
  );
}

// Contenido libre en el encabezado de la sección (p. ej. cliente y estado del contrato).
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  return slot ? createPortal(children, slot) : null;
}

// Setter del título del encabezado; lo provee el shell.
export const HeaderTitleContext = createContext<(title: React.ReactNode) => void>(() => {});

// Reemplaza el título del módulo en el encabezado mientras la página está montada.
export function HeaderTitle({ children }: { children: React.ReactNode }) {
  const setTitle = useContext(HeaderTitleContext);
  useEffect(() => {
    setTitle(children);
    return () => setTitle(null);
  }, [children, setTitle]);
  return null;
}
