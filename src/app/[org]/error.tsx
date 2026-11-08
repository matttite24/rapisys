"use client";

import { Button } from "@/components/ui/button";

// Si una pantalla de la organización falla, en vez de quedar en blanco se muestra el aviso y un reintento.
export default function OrgError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 p-6">
      <p className="text-sm">No se pudo cargar esta pantalla.</p>
      <Button variant="outline" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
