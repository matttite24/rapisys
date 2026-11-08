"use client";

import { ListFilterLink as Link } from "@/components/list-filter-navigation";
import { activeNavigationHref } from "@/lib/contract-filters";
import { useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { NavBadge } from "@/components/nav-badges";
import { CELL_ROW as ROW } from "@/components/cell-header";
import { modules } from "@/components/nav-config";
import { OrgLogo } from "@/components/org-switcher-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BackLink, useActiveModule, useContractNav } from "@/components/app-shell-nav";

// cerrar + organización, tira de íconos de módulos, opciones del módulo, y
// tema/cuenta al final. Todo en celdas de borde a borde.
export function MobileNav({
  account,
  orgSwitcher,
  panelTop,
  onNavigate,
}: {
  account: React.ReactNode;
  orgSwitcher: React.ReactNode;
  panelTop: React.ReactNode;
  onNavigate: () => void;
}) {
  const { path, active, to } = useActiveModule();
  const contract = useContractNav();
  const options = (contract?.groups ?? active.groups).flatMap((g) => g.items);
  const search = useSearchParams();
  const current = activeNavigationHref(path, options.map((o) => o.href), search);
  const on = "font-semibold text-foreground";
  // Cada botón de la fila inferior ocupa su celda completa.
  const cell = "[&_button]:h-16! [&_button]:w-full! [&_button]:rounded-none!";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fila 1: cerrar + ícono de la app + nombre del sistema */}
      <div className={ROW}>
        <SheetClose
          aria-label="Cerrar menú"
          className="grid h-full w-14 shrink-0 place-items-center border-r outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
        </SheetClose>
        <div className="h-full w-14 shrink-0 bg-brand text-brand-foreground">
          <OrgLogo />
        </div>
        <span className="px-4 caps-md font-medium">
          Rapisys
        </span>
      </div>

      {/* Fila 2: organización y cambiador */}
      <div className={ROW}>{panelTop ?? orgSwitcher}</div>

      {/* Columna de módulos del escritorio, en horizontal */}
      <nav aria-label="Módulos" className="grid grid-flow-col auto-cols-fr divide-x border-b">
        {modules.filter((m) => !m.bottom).map((m) => (
          <Link
            key={m.href}
            href={to(m.groups[0].items[0].href)}
            onClick={onNavigate}
            aria-label={m.label ?? m.title}
            aria-current={active === m ? "page" : undefined}
            className={cn(
              "grid h-16 place-items-center text-muted-foreground transition-colors hover:bg-accent",
              active === m && "bg-foreground/[0.07] text-foreground",
            )}
          >
            <HugeiconsIcon icon={m.icon} className="size-5" />
          </Link>
        ))}
      </nav>
      {/* Los íconos no se pueden leer con el dedo: el módulo activo va rotulado */}
      <div className="flex h-10 items-center border-b px-6 caps">
        {active.label ?? active.title}
      </div>

      {/* Segunda columna del escritorio: opciones del módulo */}
      {options.length > 1 && (
        <nav aria-label={`Opciones de ${active.title}`}>
          {options.map((item) => (
            <Link
              key={item.href}
              href={to(item.href)}
              onClick={onNavigate}
              aria-current={current === item.href ? "page" : undefined}
              className={cn(
                "flex h-12 items-center gap-3 border-b px-6 text-sm font-medium transition-colors hover:bg-accent",
                current === item.href ? on : "text-muted-foreground",
              )}
            >
              {item.icon && (
                <HugeiconsIcon
                  icon={item.icon}
                  className={cn("size-4.5 shrink-0", current === item.href && "text-foreground")}
                />
              )}
              {item.title}
              {item.badge !== undefined && <NavBadge n={item.badge} />}
            </Link>
          ))}
          {contract && (
            <BackLink {...contract.back} onNavigate={onNavigate} className="h-12 px-6 bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-90" />
          )}
        </nav>
      )}

      {/* Pie: Ajustes (módulo inferior), tema y cuenta, como en escritorio */}
      <div className="mt-auto grid grid-flow-col auto-cols-fr divide-x border-t">
        {modules.filter((m) => m.bottom).map((m) => (
          <Link
            key={m.href}
            href={to(m.groups[0].items[0].href)}
            onClick={onNavigate}
            aria-label={m.label ?? m.title}
            aria-current={active === m ? "page" : undefined}
            className={cn(
              "grid h-16 place-items-center text-muted-foreground transition-colors hover:bg-accent",
              active === m && "bg-foreground/[0.07] text-foreground",
            )}
          >
            <HugeiconsIcon icon={m.icon} className="size-5" />
          </Link>
        ))}
        <div className={cell}>
          <ThemeToggle variant="ghost" />
        </div>
        <div className={cell}>{account}</div>
      </div>
    </div>
  );
}
