"use client";

import { ListFilterLink as Link } from "@/components/list-filter-navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Pending } from "@/components/nav-pending";
import { CELL_ROW as ROW } from "@/components/cell-header";
import { modules, type NavModule } from "@/components/nav-config";
import { OrgLogo } from "@/components/org-switcher-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useActiveModule } from "@/components/app-shell-nav";

// Al tocar un módulo se abre la columna de opciones, que muestra las del módulo elegido.
export function RailLink({
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
export function Rail({ onOpenPanel, preview }: { onOpenPanel?: (m: NavModule) => void; preview?: NavModule | null }) {
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
