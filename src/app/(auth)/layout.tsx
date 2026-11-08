import { HugeiconsIcon } from "@hugeicons/react";
import { PowerServiceIcon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "@/components/theme-toggle";

// Las fases reales de un contrato, en el orden en que se recorren, con el color de su estado en la app.
const PHASES = [
  { label: "Nuevo", dot: "bg-state-pending" },
  { label: "En ejecución", dot: "bg-state-partial" },
  { label: "Entregado", dot: "bg-state-arriving" },
  { label: "Facturado", dot: "bg-state-stock" },
  { label: "Cobrado", dot: "bg-state-delivered" },
];

function Brand({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 font-mono text-lg font-medium ${className ?? ""}`}>
      <span aria-hidden className="grid size-9 place-items-center bg-brand text-brand-foreground">
        <HugeiconsIcon icon={PowerServiceIcon} className="size-5" strokeWidth={2} />
      </span>
      Rapisys
    </div>
  );
}

// Mismo lenguaje que la app: capas grises separadas por líneas finas, rótulos en mayúsculas mono y el amarillo solo en
// la marca y la acción principal.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[5fr_4fr]">
      <section className="hidden flex-col justify-between border-r bg-layer-1 p-10 lg:flex">
        <Brand />
        <div className="flex max-w-md flex-col gap-4">
          <p className="caps text-muted-foreground">Contratos de suministro</p>
          <h2 className="text-4xl leading-tight font-semibold text-balance">Gestión de procesos de contrato</h2>
        </div>
        <ol aria-label="Fases de un contrato" className="grid grid-cols-5 divide-x border bg-background">
          {PHASES.map((phase, i) => (
            <li key={phase.label} className="flex flex-col gap-2 px-3 py-3">
              <span className="num text-2xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex items-center gap-2 text-sm font-medium">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${phase.dot}`} />
                {phase.label}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative flex flex-col items-center justify-center gap-8 p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Brand className="lg:hidden" />
        {children}
      </section>
    </main>
  );
}
