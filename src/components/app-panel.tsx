"use client";

import { ListFilterLink as Link } from "@/components/list-filter-navigation";
import { activeNavigationHref } from "@/lib/contract-filters";
import { useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { NavBadge } from "@/components/nav-badges";
import { Pending } from "@/components/nav-pending";
import { CELL_ROW as ROW } from "@/components/cell-header";
import { type NavModule } from "@/components/nav-config";
import { cn } from "@/lib/utils";
import { useActiveModule, useContractNav } from "@/components/app-shell-nav";

// Columna 2: opciones del módulo/pantalla. Su celda superior es el selector de organización.
export function Panel({
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
  // La pantalla de Gastos cuelga de Pagos: allí también se marca esa opción.
  const current = activeNavigationHref(path.replace(/^(\/contratos\/[^/]+)\/gastos(?=\/|$)/, "$1/pagos"), groups.flatMap((g) => g.items.map((i) => i.href)), search);

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
