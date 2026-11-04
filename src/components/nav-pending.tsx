"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

// Dentro de un <Link>: mientras la navegación está en curso, el contenido late. La persona ve que el clic
// se registró al instante, aunque la pantalla nueva aún no haya llegado.
export function Pending({ className, children }: { className?: string; children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={cn(className, pending && "motion-safe:animate-pulse")}>{children}</span>;
}
