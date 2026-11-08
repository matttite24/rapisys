"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageFooterContext, PageShortcuts } from "@/components/page-shortcuts";
import { cn } from "@/lib/utils";

// Actualizar la información de la página sin recargarla: atajo Alt + R y botón en la barra inferior, con la hora de la
// última actualización. `stamp` llega del servidor (cambia cada vez que la página se vuelve a calcular).
export function PageRefresh({ stamp }: { stamp: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const refresh = () =>
    start(() => {
      router.refresh();
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyR" || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      start(() => {
        router.refresh();
        toast.success("Información actualizada");
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <PageShortcuts shortcuts={[{ keys: ["Alt", "R"], label: "Actualizar" }]} />
      <PageFooterContext>
        <span className="truncate text-xs text-muted-foreground">
          Actualizado{" "}
          <span suppressHydrationWarning className="num text-foreground">
            {new Date(stamp).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5" onClick={refresh} disabled={pending} aria-label="Actualizar información">
          <HugeiconsIcon icon={RefreshIcon} className={cn("size-3.5", pending && "animate-spin")} />
          Actualizar
        </Button>
      </PageFooterContext>
    </>
  );
}
