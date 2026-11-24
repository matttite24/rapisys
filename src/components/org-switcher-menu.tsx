"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  PowerServiceIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { OrgNameLabel } from "@/components/org-name-label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgOption } from "@/lib/orgs";

export function OrgLogo() {
  return (
    <span className="grid size-full place-items-center">
      <HugeiconsIcon icon={PowerServiceIcon} className="size-8" strokeWidth={1.75} />
    </span>
  );
}

// La celda de la organización es el botón para cambiar de organización.
// `side="top"`: en el pie de la pantalla el menú se abre hacia arriba.
export function OrgSwitcherMenu({ orgs, org, side = "bottom" }: { orgs: OrgOption[]; org: string; side?: "top" | "bottom" }) {
  const current = orgs.find((o) => o.slug === org);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar de organización"
        className="flex size-full items-center justify-between gap-2 px-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <OrgNameLabel name={current?.name ?? org} />
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="min-w-56">
        {orgs.map((o) => (
          <DropdownMenuItem key={o.slug} render={<Link href={`/${o.slug}/contratos`} />}>
            <span className="flex-1 truncate">{o.name}</span>
            {o.slug === org && (
              <span className="text-xs text-muted-foreground">Actual</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem render={<Link href="/onboarding" />}>
          <HugeiconsIcon icon={Add01Icon} /> Nueva organización
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
