"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

// Señal inmediata del enlace en navegación; el menú la usa para resaltar el destino.
export function Pending({ className, children }: { className?: string; children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span data-navigation-pending={pending ? "" : undefined} aria-busy={pending} className={cn(className)}>{children}</span>;
}
