"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  Cancel01Icon,
  Menu01Icon,
} from "@hugeicons/core-free-icons";
import { CELL_ROW as ROW, CellHeader } from "@/components/cell-header";
import { HeaderSlotContext, HeaderTitleContext } from "@/components/header-action";
import { modules, type NavModule } from "@/components/nav-config";
import { OrgLogo } from "@/components/org-switcher-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Diseño de celdas: una fila superior común (h-14) y dos columnas de alto
// completo (módulos y opciones), separadas por líneas que se cruzan.

// Las rutas viven bajo /[org]; la config de navegación usa rutas sin prefijo.
const OrgContext = createContext("");

function useActiveModule() {
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
function activeHref(path: string, hrefs: string[]) {
  return hrefs
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

function RailLink({ module: m }: { module: NavModule }) {
  const { active, to } = useActiveModule();
  const label = m.label ?? m.title;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={to(m.groups[0].items[0].href)}
            aria-label={label}
            className={cn(
              "grid size-10 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active === m && "bg-foreground/[0.06] text-brand hover:text-brand",
            )}
            aria-current={active === m ? "page" : undefined}
          />
        }
      >
        <HugeiconsIcon icon={m.icon} className="size-5" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// Columna 1: módulos (solo íconos). Su celda superior es el ícono de la app,
// que muestra u oculta la columna de opciones.
function Rail({
  account,
  panelOpen,
  onTogglePanel,
}: {
  account: React.ReactNode;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col border-r">
      <div className={cn(ROW, "bg-brand text-brand-foreground")}>
        {onTogglePanel ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={panelOpen ? "Ocultar opciones" : "Mostrar opciones"}
                  aria-expanded={panelOpen}
                  onClick={onTogglePanel}
                  className="group relative size-full cursor-pointer outline-none transition-colors hover:bg-black/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
              }
            >
              {/* Al pasar el mouse, el logo da paso a una flecha que indica la acción */}
              <span className="absolute inset-0 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
                <OrgLogo />
              </span>
              <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <HugeiconsIcon
                  icon={panelOpen ? ArrowLeftDoubleIcon : ArrowRightDoubleIcon}
                  className="size-6"
                />
              </span>
              {/* Indicio permanente (también en pantallas táctiles, sin hover) */}
              <HugeiconsIcon
                icon={panelOpen ? ArrowLeftDoubleIcon : ArrowRightDoubleIcon}
                className="pointer-events-none absolute right-1 bottom-1 size-3 opacity-80 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"
              />
            </TooltipTrigger>
            <TooltipContent side="right">
              {panelOpen ? "Ocultar opciones" : "Mostrar opciones"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <OrgLogo />
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 py-3">
        {modules.filter((m) => !m.bottom).map((m) => (
          <RailLink key={m.href} module={m} />
        ))}

        <div className="mt-auto flex flex-col items-center gap-1">
          {modules.filter((m) => m.bottom).map((m) => (
            <RailLink key={m.href} module={m} />
          ))}
          <ThemeToggle variant="ghost" className="size-10" />
          {account}
        </div>
      </div>
    </div>
  );
}

// Columna 2: opciones del módulo/pantalla. Su celda superior es el selector de organización.
function Panel({
  orgSwitcher,
  onNavigate,
}: {
  orgSwitcher: React.ReactNode;
  onNavigate?: () => void;
}) {
  const { path, active, to } = useActiveModule();
  const current = activeHref(path, active.groups.flatMap((g) => g.items.map((i) => i.href)));

  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-muted/50">
      <div className={cn(ROW, "crosshair")}>{orgSwitcher}</div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {active.groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {g.label && (
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {g.label}
              </p>
            )}
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={to(item.href)}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-none px-2 py-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  current === item.href &&
                    "bg-foreground/[0.06] font-medium text-foreground",
                )}
                aria-current={current === item.href ? "page" : undefined}
              >
                {item.icon && (
                  <HugeiconsIcon
                    icon={item.icon}
                    className={cn("size-4.5", current === item.href && "text-brand")}
                  />
                )}
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

// Menú móvil, en la misma cuadrícula que escritorio y de arriba abajo:
// cerrar + organización, tira de íconos de módulos, opciones del módulo, y
// tema/cuenta al final. Todo en celdas de borde a borde.
function MobileNav({
  account,
  orgSwitcher,
  onNavigate,
}: {
  account: React.ReactNode;
  orgSwitcher: React.ReactNode;
  onNavigate: () => void;
}) {
  const { path, active, to } = useActiveModule();
  const options = active.groups.flatMap((g) => g.items);
  const current = activeHref(path, options.map((o) => o.href));
  const on = "bg-foreground/[0.06] font-medium text-foreground";
  // Cada botón de la fila inferior ocupa su celda completa.
  const cell = "[&_button]:h-14! [&_button]:w-full! [&_button]:rounded-none!";

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
        <span className="px-4 font-mono text-sm font-medium uppercase tracking-[0.12em]">
          Rapisys
        </span>
      </div>

      {/* Fila 2: organización y cambiador */}
      <div className={ROW}>{orgSwitcher}</div>

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
              "grid h-14 place-items-center text-muted-foreground transition-colors hover:bg-accent",
              active === m && "bg-foreground/[0.06] text-brand",
            )}
          >
            <HugeiconsIcon icon={m.icon} className="size-5" />
          </Link>
        ))}
      </nav>
      {/* Los íconos no se pueden leer con el dedo: el módulo activo va rotulado */}
      <div className="flex h-10 items-center border-b px-6 font-mono text-[0.6875rem] uppercase tracking-[0.12em]">
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
                "flex h-12 items-center gap-3 border-b px-6 font-mono text-xs uppercase tracking-[0.08em] transition-colors hover:bg-accent",
                current === item.href ? on : "text-muted-foreground",
              )}
            >
              {item.icon && (
                <HugeiconsIcon
                  icon={item.icon}
                  className={cn("size-4.5 shrink-0", current === item.href && "text-brand")}
                />
              )}
              {item.title}
            </Link>
          ))}
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
              "grid h-14 place-items-center text-muted-foreground transition-colors hover:bg-accent",
              active === m && "bg-foreground/[0.06] text-brand",
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

function SectionHeader({
  leading,
  setSlot,
  title,
}: {
  leading: React.ReactNode;
  setSlot: (el: HTMLElement | null) => void;
  title: React.ReactNode;
}) {
  const { active } = useActiveModule();
  return (
    <CellHeader
      title={title ?? active.title}
      leading={leading}
      action={<div ref={setSlot} className="flex items-center gap-1 self-stretch" />}
    />
  );
}

export function AppShell({
  org,
  account,
  orgSwitcher,
  children,
}: {
  org: string;
  account: React.ReactNode;
  orgSwitcher: React.ReactNode;
  children: React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState<React.ReactNode>(null);

  return (
    <OrgContext.Provider value={org}>
      <HeaderSlotContext.Provider value={slot}>
      <HeaderTitleContext.Provider value={setTitle}>
      <div className="flex h-svh">
        {/* Escritorio */}
        <aside className="hidden shrink-0 md:flex">
          <Rail
            account={account}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
          />
          {panelOpen && <Panel orgSwitcher={orgSwitcher} />}
        </aside>

        {/* Celda de contenido: encabezado de sección + página */}
        <div className="flex min-w-0 flex-1 flex-col">
          <SectionHeader
            setSlot={setSlot}
            title={title}
            leading={
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:hidden"
                    aria-label="Abrir menú"
                  />
                }
              >
                <HugeiconsIcon icon={Menu01Icon} className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-[90vw]! max-w-[90vw]! gap-0 p-0"
              >
                <SheetTitle className="sr-only">Menú</SheetTitle>
                <MobileNav
                  account={account}
                  orgSwitcher={orgSwitcher}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            }
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      </HeaderTitleContext.Provider>
      </HeaderSlotContext.Provider>
    </OrgContext.Provider>
  );
}
