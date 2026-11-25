"use client";

import { ListFilterNavigationProvider } from "@/components/list-filter-navigation";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { NavBadgesContext, NavBadgesSetContext } from "@/components/nav-badges";
import { usePanelOpen } from "@/components/use-panel-open";
import { useNarrowScreen, useRightPanelOpen } from "@/components/use-side-panel";
import { HeaderCrumbContext, HeaderSlotContext, HeaderTitleContext } from "@/components/header-action";
import { type NavModule } from "@/components/nav-config";
import { PanelCardContext, PanelTopContext, type PanelCardParts } from "@/components/panel-slots";
import { useModKey, PageFiguresContext, FooterActionsContext, FooterContextContext, PageNewActionContext, PagePaginationContext, PageShortcutsContext, type PageFigure, type PagePaginationState, type PageShortcut } from "@/components/page-shortcuts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { OrgContext } from "@/components/app-shell-nav";
import { Rail } from "@/components/app-rail";
import { Panel } from "@/components/app-panel";
import { MobileNav } from "@/components/mobile-nav";
import { Footer, SectionHeader } from "@/components/app-footer";

export function AppShell({
  org,
  account,
  orgSwitcher,
  orgMenu,
  children,
}: {
  org: string;
  account: React.ReactNode;
  orgSwitcher: React.ReactNode;
  orgMenu: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [peek, setPeek] = useState<{ module: NavModule; from: string } | null>(null);
  // La vista previa vale solo hasta que cambia la ruta.
  const preview = peek && peek.from === pathname ? peek.module : null;
  // Se descarta al cambiar de ruta; si no, volver a la ruta de origen la resucitaría y taparía el subsidebar del proceso.
  if (peek && peek.from !== pathname) setPeek(null);
  const mod = useModKey();
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
  const [crumb, setCrumb] = useState<React.ReactNode>(null);
  const [panelTop, setPanelTop] = useState<React.ReactNode>(null);
  const [panelCard, setPanelCard] = useState<PanelCardParts | null>(null);
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
      <HeaderCrumbContext.Provider value={setCrumb}>
      <PanelTopContext.Provider value={setPanelTop}>
      <PanelCardContext.Provider value={setPanelCard}>
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
        <aside className="relative hidden shrink-0 border-r border-foreground/10 md:flex md:pb-(--footer-height) print:hidden">
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
            <Panel card={panelCard} preview={preview} />
          </div>
          {/* Plegar o abrir las opciones: un botón sobre el borde que separa el riel de la columna, a media altura de la pantalla. */}
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? "Ocultar opciones" : "Mostrar opciones"}
            title={`${panelOpen ? "Ocultar" : "Mostrar"} opciones (${mod} B)`}
            className="absolute top-1/2 left-16 z-[26] grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-background text-muted-foreground shadow-xs transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          >
            <HugeiconsIcon icon={panelOpen ? ArrowLeft01Icon : ArrowRight01Icon} className="size-3" strokeWidth={2.5} aria-hidden />
          </button>
        </aside>

        {/* Celda de contenido: encabezado de sección + página */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SectionHeader
            setSlot={setSlot}
            title={title}
            crumb={crumb}
            panelOpen={panelOpen}
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
        orgMenu={orgMenu}
        panelOpen={panelOpen}
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
      </PanelCardContext.Provider>
      </PanelTopContext.Provider>
      </HeaderCrumbContext.Provider>
      </HeaderTitleContext.Provider>
      </HeaderSlotContext.Provider>
    </OrgContext.Provider>
    </ListFilterNavigationProvider>
  );
}

