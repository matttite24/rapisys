"use client";

import { ListFilterLink as Link } from "@/components/list-filter-navigation";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home01Icon } from "@hugeicons/core-free-icons";
import { NavBadgesContext } from "@/components/nav-badges";
import { CONTRACT_SECTIONS, modules, type NavGroup } from "@/components/nav-config";
import { cn } from "@/lib/utils";

// Las rutas viven bajo /[org]; la config de navegación usa rutas sin prefijo.
export const OrgContext = createContext("");

export function useActiveModule() {
  const org = useContext(OrgContext);
  const pathname = usePathname();
  const path = pathname.slice(org.length + 1) || "/";
  const active =
    modules.find((m) => path === m.href || path.startsWith(m.href + "/")) ??
    modules[0];
  return { org, path, active, to: (href: string) => `/${org}${href}` };
}

// La opción activa es la de ruta más larga que contiene la actual (p. ej.
// /bodega/123 marca "Items", y /bodega/activos/nuevo marca "Activos").
// Dentro de un contrato (/contratos/{id}[/parte]) la columna de opciones muestra
// sus partes en lugar de las opciones del módulo, más un regreso a la vista general.
export function useContractNav(): { groups: NavGroup[]; back: { title: string; href: string } } | null {
  const { path } = useActiveModule();
  const badges = useContext(NavBadgesContext);
  const m = path.match(/^\/contratos\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!m) return null;
  return {
    groups: [
      {
        items: CONTRACT_SECTIONS.map((s) => ({
          title: s.title,
          href: `/contratos/${m[1]}${s.slug ? `/${s.slug}` : ""}`,
          icon: s.icon,
          badge: badges[s.slug],
        })),
      },
    ],
    back: { title: "Volver", href: "/contratos" },
  };
}

export function BackLink({ title, href, onNavigate, className }: { title: string; href: string; onNavigate?: () => void; className?: string }) {
  const { to } = useActiveModule();
  return (
    <Link
      href={to(href)}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 px-2 caps-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={Home01Icon} className="size-4.5" />
      {title}
    </Link>
  );
}
