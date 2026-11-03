"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Partes de un contrato. Fuera de Nuevo se trabajan todas; en Nuevo solo el detalle.
const SECTIONS = [
  { slug: "", label: "Detalle" },
  { slug: "items", label: "Items" },
  { slug: "compras", label: "Compras" },
  { slug: "gastos", label: "Gastos" },
  { slug: "archivos", label: "Archivos" },
] as const;

// La celda superior de la columna de opciones, dentro de un contrato: cambia de parte.
export function ContractSwitcher({
  org,
  id,
  code,
  status,
}: {
  org: string;
  id: string;
  code: string;
  status: string;
}) {
  const pathname = usePathname();
  const base = `/${org}/contratos/${id}`;
  const slug = pathname.startsWith(base + "/") ? pathname.slice(base.length + 1).split("/")[0] : "";
  const sections = status === "new" ? SECTIONS.slice(0, 1) : SECTIONS;
  const current = SECTIONS.find((s) => s.slug === slug) ?? SECTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar de parte del contrato"
        className="flex size-full min-w-0 items-center justify-between gap-2 px-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">{code}</span>
          <span className="truncate font-mono text-sm font-medium uppercase tracking-[0.1em]">
            {current.label}
          </span>
        </span>
        <HugeiconsIcon icon={UnfoldMoreIcon} className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="min-w-56">
        {sections.map((s) => (
          <DropdownMenuItem key={s.slug} render={<Link href={s.slug ? `${base}/${s.slug}` : base} />}>
            <span className="flex-1">{s.label}</span>
            {s.slug === current.slug && <span className="text-xs text-muted-foreground">Actual</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
