"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GridViewIcon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export type ContractView = "lista" | "grid";

// Subencabezado del listado: búsqueda (va al servidor, con pausa corta al escribir) y cambio de vista.
export function ContractToolbar({ q, view }: { q: string; view: ContractView }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [value, setValue] = useState(q);

  const href = (v: ContractView) => {
    const next = new URLSearchParams(sp);
    next.set("vista", v);
    next.delete("page");
    return `${path}?${next}`;
  };

  return (
    <div className="flex h-12 items-stretch border-b">
      <div className="relative min-w-0 flex-1">
        <HugeiconsIcon
          icon={Search01Icon}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-6 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          aria-label="Buscar contratos"
          placeholder="Buscar por código o nombre del contrato"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const next = new URLSearchParams(sp);
              const t = e.target.value.trim();
              if (t) next.set("q", t);
              else next.delete("q");
              next.delete("page");
              router.replace(`${path}?${next}`, { scroll: false });
            }, 350);
          }}
          className="h-full w-full bg-transparent pr-4 pl-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background"
        />
      </div>
      <div role="group" aria-label="Vista" className="flex shrink-0 divide-x border-l">
        {(
          [
            ["lista", "Lista", Menu01Icon],
            ["grid", "Cuadrícula", GridViewIcon],
          ] as const
        ).map(([key, label, icon]) => (
          <Link
            key={key}
            href={href(key)}
            replace
            scroll={false}
            aria-label={`Vista en ${label.toLowerCase()}`}
            aria-current={view === key ? "true" : undefined}
            className={cn(
              "grid w-12 place-items-center transition-colors hover:bg-accent",
              view === key ? "bg-surface-strong/60 text-foreground shadow-[inset_0_-2px_0_var(--brand)]" : "text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={icon} className="size-5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
