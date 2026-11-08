"use client";

import { ListFilterLink as Link, ListFilterNavigationProvider } from "@/components/list-filter-navigation";
import { activeNavigationHref } from "@/lib/contract-filters";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  Cancel01Icon,
  Menu01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "@hugeicons/core-free-icons";
import { NavBadge, NavBadgesContext, NavBadgesSetContext } from "@/components/nav-badges";
import { Pending } from "@/components/nav-pending";
import { usePanelOpen } from "@/components/use-panel-open";
import { useNarrowScreen, useRightPanelOpen } from "@/components/use-side-panel";
import { CELL_ROW as ROW, CellHeader } from "@/components/cell-header";
import { HeaderSlotContext, HeaderTitleContext } from "@/components/header-action";
import { CONTRACT_SECTIONS, modules, type NavGroup, type NavModule } from "@/components/nav-config";
import { OrgLogo } from "@/components/org-switcher-menu";
import { PanelTopContext } from "@/components/panel-slots";
import {
  PageFiguresContext,
  FooterActionsContext,
  FooterContextContext,
  PageNewActionContext,
  PagePaginationContext,
  PageShortcutsContext,
  useModKey,
  type PageFigure,
  type PagePaginationState,
  type PageShortcut,
} from "@/components/page-shortcuts";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutBar } from "@/components/shortcut-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Diseño de celdas: una fila superior común (h-15) y dos columnas de alto
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
// Dentro de un contrato (/contratos/{id}[/parte]) la columna de opciones muestra
// sus partes en lugar de las opciones del módulo, más un regreso a la vista general.
function useContractNav(): { groups: NavGroup[]; back: { title: string; href: string } } | null {
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

function BackLink({ title, href, onNavigate, className }: { title: string; href: string; onNavigate?: () => void; className?: string }) {
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

// Al tocar un módulo se abre la columna de opciones, que muestra las del módulo elegido.
function RailLink({
  module: m,
  current,
  onOpen,
}: {
  module: NavModule;
  current: boolean;
  onOpen?: (m: NavModule) => void;
}) {
  const { to } = useActiveModule();
  const label = m.label ?? m.title;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={to(m.groups[0].items[0].href)}
            aria-label={label}
            onClick={(e) => {
              // Con Cmd/Ctrl/Shift o clic medio el enlace se abre aparte y esta pantalla no cambia.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              onOpen?.(m);
            }}
            data-rail-current={current ? "" : undefined}
            className={cn(
              "grid aspect-square w-full place-items-center text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground has-[[data-navigation-pending]]:bg-foreground/[0.08] has-[[data-navigation-pending]]:text-foreground",
              current && "text-foreground hover:bg-transparent",
            )}
            aria-current={current ? "page" : undefined}
          />
        }
      >
        <Pending className="grid place-items-center">
          <HugeiconsIcon icon={m.icon} className="size-5" />
        </Pending>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// Columna 1: módulos (solo íconos). Su celda superior es el ícono de la app,
// con el logo de la organización. El filo del módulo activo es una sola barra que sube y baja entre módulos.
function Rail({ onOpenPanel, preview }: { onOpenPanel?: (m: NavModule) => void; preview?: NavModule | null }) {
  const { active } = useActiveModule();
  const target = preview ?? active;
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  // La primera medición no se anima: la barra aparece ya en su sitio.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>("[data-rail-current]");
      setBar(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [target]);

  useEffect(() => {
    if (bar && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [bar, animate]);

  return (
    <div className="flex w-16 shrink-0 flex-col border-r bg-layer-1">
      <div className={cn(ROW, "bg-brand text-brand-foreground")}>
        <OrgLogo />
      </div>

      <div ref={listRef} className="relative flex flex-1 flex-col">
        {bar && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-nav-marker",
              animate && "transition-[transform,height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            )}
            style={{ transform: `translateY(${bar.top}px)`, height: bar.height }}
          />
        )}
        {/* Todos los módulos juntos, Ajustes incluido; al fondo queda solo el cambio de tema. */}
        {modules.map((m) => (
          <RailLink key={m.href} module={m} current={m === target} onOpen={onOpenPanel} />
        ))}

        <div className="mt-auto flex flex-col">
          <ThemeToggle variant="ghost" className="size-auto aspect-square w-full rounded-none" />
        </div>
      </div>
    </div>
  );
}

// Columna 2: opciones del módulo/pantalla. Su celda superior es el selector de organización.
function Panel({
  orgSwitcher,
  panelTop,
  onNavigate,
  preview,
}: {
  // Módulo recién tocado en el riel: sus opciones se ven ya, sin esperar a que cargue la página.
  preview?: NavModule | null;
  orgSwitcher: React.ReactNode;
  // Si una pantalla aporta celda superior, reemplaza al selector de organización.
  panelTop: React.ReactNode;
  onNavigate?: () => void;
}) {
  const { path, active, to } = useActiveModule();
  const contract = useContractNav();
  const groups = preview ? preview.groups : (contract?.groups ?? active.groups);
  const search = useSearchParams();
  const current = activeNavigationHref(path, groups.flatMap((g) => g.items.map((i) => i.href)), search);

  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-layer-2">
      <div className={ROW}>{panelTop ?? orgSwitcher}</div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-3">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {/* Entre grupos, una línea fina (sin encabezado). */}
            {i > 0 && <div aria-hidden className="mx-5 mb-2 border-t" />}
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={to(item.href)}
                onClick={onNavigate}
                className={cn(
                  "mx-2 flex min-h-10 items-center gap-2.5 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground has-[[data-navigation-pending]]:bg-foreground/[0.06] has-[[data-navigation-pending]]:text-foreground",
                  current === item.href &&
                    "font-semibold text-foreground",
                )}
                aria-current={current === item.href ? "page" : undefined}
              >
                <Pending className="flex items-center gap-2.5">
                  {item.icon && (
                    <HugeiconsIcon
                      icon={item.icon}
                      strokeWidth={current === item.href ? 2.25 : 1.5}
                      className="size-4.5 transition-[stroke-width,color]"
                    />
                  )}
                  {item.title}
                </Pending>
                {item.badge !== undefined && <NavBadge n={item.badge} />}
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

function SectionHeader({
  leading,
  setSlot,
  title,
}: {
  leading: React.ReactNode;
  setSlot: (el: HTMLElement | null) => void;
  title: React.ReactNode;
}) {
  const { active, path } = useActiveModule();
  // Dentro de un contrato: arriba la sección y debajo "cliente / contrato" (lo que pone el layout).
  const slug = path.match(/^\/contratos\/[0-9a-f-]{36}(?:\/([^/]+))?/i);
  const section = slug ? CONTRACT_SECTIONS.find((s) => s.slug === (slug[1] ?? "")) : undefined;
  return (
    <CellHeader
      // Por encima de las filas fijas de las pantallas (buscadores y pestañas, z-20) para que su sombra siempre se vea, y por
      // debajo de las columnas laterales y los cajones (z-30 y más).
      className="crosshair-start relative z-[25] shadow-bar print:hidden"
      title={section ? section.title : (title ?? active.title)}
      subtitle={section ? title : undefined}
      leading={leading}
      action={<div ref={setSlot} className="flex items-center gap-1 self-stretch" />}
    />
  );
}

// Pie de la cuadrícula, con las mismas tres columnas que el encabezado: cuenta bajo los módulos,
// "Volver" (dentro de un contrato) bajo las opciones, y los atajos bajo el contenido.
function Footer({
  setActionsSlot,
  setContextSlot,
  newLabel,
  account,
  panelOpen,
  onTogglePanel,
  pageShortcuts,
  pageFigures,
  pagePagination,
}: {
  setActionsSlot: (node: HTMLDivElement | null) => void;
  setContextSlot: (node: HTMLDivElement | null) => void;
  newLabel: string | null;
  account: React.ReactNode;
  panelOpen: boolean;
  onTogglePanel: () => void;
  pageShortcuts: PageShortcut[];
  pageFigures: PageFigure[];
  pagePagination: PagePaginationState | null;
}) {
  const mod = useModKey();
  return (
    <div data-layout-footer className="absolute inset-x-0 bottom-0 z-[24] hidden h-(--footer-height) border-t print:hidden md:flex">
      {/* La celda de la cuenta es la continuación de la columna de módulos: mismo fondo, mismo borde y el ícono con el
          color y el resalte de los demás íconos de la columna. */}
      <div className="w-16 shrink-0 border-r bg-layer-1 [&_button]:size-full! [&_button]:rounded-none! [&_button]:bg-transparent! [&_button]:text-muted-foreground! [&_button]:transition-colors [&_button:hover]:bg-foreground/[0.08]! [&_button:hover]:text-foreground!">
        {account}
      </div>
      {/* Bajo las opciones: el botón para plegarlas (y su atajo). Plegadas, la celda desaparece; para abrirlas se toca un
          módulo del riel o se usa el atajo, que la barra recuerda a la derecha. */}
      <div
        inert={!panelOpen}
        className={cn(
          "shrink-0 overflow-hidden bg-layer-2 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          panelOpen ? "w-60 border-r" : "w-0",
        )}
      >
        <button
          type="button"
          onClick={onTogglePanel}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Ocultar opciones" : "Mostrar opciones"}
          title={`${panelOpen ? "Ocultar" : "Mostrar"} opciones (${mod} B)`}
          className="flex h-full w-60 items-center gap-2.5 px-[0.9375rem] text-sm text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={panelOpen ? SidebarLeftIcon : SidebarRightIcon} className="size-[1.125rem] shrink-0" aria-hidden />
          <span className="truncate">{panelOpen ? "Ocultar opciones" : "Mostrar opciones"}</span>
          <span className="ml-auto flex shrink-0 gap-0.5 pr-4" aria-hidden>
            <Kbd className="h-5 min-w-5 border-0 bg-foreground/[0.07] px-1 text-[0.6875rem] font-normal">{mod}</Kbd>
            <Kbd className="h-5 min-w-5 border-0 bg-foreground/[0.07] px-1 text-[0.6875rem] font-normal">B</Kbd>
          </span>
        </button>
      </div>
      <div className="relative flex min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none absolute -top-[6px] -left-[6px] z-30 size-[11px]">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground" />
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground" />
        </span>
        <ShortcutBar pageShortcuts={pageShortcuts} pageFigures={pageFigures} pagePagination={pagePagination} setActionsSlot={setActionsSlot} setContextSlot={setContextSlot} newLabel={newLabel} leading={panelOpen ? null : (
          <button
            type="button"
            onClick={onTogglePanel}
            aria-label="Mostrar opciones"
            className="flex shrink-0 items-center gap-2 border-r px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={SidebarRightIcon} className="size-[1.125rem]" aria-hidden />
            Mostrar opciones
            <span className="flex gap-0.5" aria-hidden>
              <Kbd className="h-5 min-w-5 border-0 bg-foreground/[0.07] px-1 text-[0.6875rem] font-normal">{mod}</Kbd>
              <Kbd className="h-5 min-w-5 border-0 bg-foreground/[0.07] px-1 text-[0.6875rem] font-normal">B</Kbd>
            </span>
          </button>
        )} />
      </div>
    </div>
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
  const pathname = usePathname();
  const [peek, setPeek] = useState<{ module: NavModule; from: string } | null>(null);
  // La vista previa vale solo hasta que cambia la ruta.
  const preview = peek && peek.from === pathname ? peek.module : null;
  const [panelPref, setPanelPref] = usePanelOpen();
  // Plegada sola en pantallas angostas o con la columna derecha abierta; el usuario puede abrirla mientras dure ese estado.
  const narrow = useNarrowScreen();
  const rightOpen = useRightPanelOpen();
  const auto = narrow || rightOpen;
  const [prevAuto, setPrevAuto] = useState(auto);
  const [forced, setForced] = useState(false);
  if (auto !== prevAuto) {
    setPrevAuto(auto);
    setForced(false);
  }
  const panelOpen = auto ? forced : panelPref;
  const setPanelOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(panelOpen) : v;
    if (auto) setForced(next);
    else setPanelPref(next);
  };
  // Atajo para plegar o abrir las opciones: Ctrl/⌘ + B.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setPanelOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState<React.ReactNode>(null);
  const [panelTop, setPanelTop] = useState<React.ReactNode>(null);
  const [pageShortcuts, setPageShortcuts] = useState<PageShortcut[]>([]);
  const [pageFigures, setPageFigures] = useState<PageFigure[]>([]);
  const [pagePagination, setPagePagination] = useState<PagePaginationState | null>(null);
  const [footerActionsSlot, setFooterActionsSlot] = useState<HTMLDivElement | null>(null);
  const [footerContextSlot, setFooterContextSlot] = useState<HTMLDivElement | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});

  return (
    <ListFilterNavigationProvider>
    <OrgContext.Provider value={org}>
      <HeaderSlotContext.Provider value={slot}>
      <HeaderTitleContext.Provider value={setTitle}>
      <PanelTopContext.Provider value={setPanelTop}>
      <PageShortcutsContext.Provider value={setPageShortcuts}>
      <PageFiguresContext.Provider value={setPageFigures}>
      <PagePaginationContext.Provider value={setPagePagination}>
      <FooterActionsContext.Provider value={footerActionsSlot}>
      <FooterContextContext.Provider value={footerContextSlot}>
      <PageNewActionContext.Provider value={setNewLabel}>
      <NavBadgesSetContext.Provider value={setNavBadges}>
      <NavBadgesContext.Provider value={navBadges}>
      {/* Con una columna lateral fija abierta (--assign-w), toda la interfaz, encabezado incluido, se empuja a la izquierda. */}
      <div className="fixed inset-0 flex flex-col lg:pr-(--assign-w,0rem) lg:transition-[padding] lg:duration-200 lg:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:lg:transition-none print:static print:block">
      <div className="flex h-0 min-h-0 flex-1 print:block print:h-auto">
        {/* Escritorio */}
        <aside className="relative hidden shrink-0 md:flex md:pb-(--footer-height) print:hidden">
          <Rail
            preview={preview}
            onOpenPanel={(m) => {
              setPanelOpen(true);
              setPeek({ module: m, from: pathname });
            }}
          />
          {/* Siempre montada: el ancho se anima y la columna conserva su tamaño por dentro, así el
              contenido no se reacomoda mientras se abre o se cierra. Cerrada, no recibe foco. */}
          <div
            inert={!panelOpen}
            aria-hidden={!panelOpen}
            className={cn(
              "flex shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
              panelOpen ? "w-60" : "w-0",
            )}
          >
            <Panel orgSwitcher={orgSwitcher} panelTop={panelTop} preview={preview} />
          </div>
        </aside>

        {/* Celda de contenido: encabezado de sección + página */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                  panelTop={panelTop}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            }
          />
          {/* El pie flota sobre el borde inferior (desenfocado): el relleno inferior deja el final del contenido por encima de él. */}
          <main className="flex-1 overflow-y-auto md:pb-(--footer-height) print:overflow-visible">{children}</main>
        </div>
      </div>
      <Footer
        setActionsSlot={setFooterActionsSlot}
        setContextSlot={setFooterContextSlot}
        newLabel={newLabel}
        account={account}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        pageShortcuts={pageShortcuts}
        pageFigures={pageFigures}
        pagePagination={pagePagination}
      />
      </div>
      </NavBadgesContext.Provider>
      </NavBadgesSetContext.Provider>
      </PageNewActionContext.Provider>
      </FooterContextContext.Provider>
      </FooterActionsContext.Provider>
      </PagePaginationContext.Provider>
      </PageFiguresContext.Provider>
      </PageShortcutsContext.Provider>
      </PanelTopContext.Provider>
      </HeaderTitleContext.Provider>
      </HeaderSlotContext.Provider>
    </OrgContext.Provider>
    </ListFilterNavigationProvider>
  );
}
