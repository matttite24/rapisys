import { HugeiconsIcon } from "@hugeicons/react";
import { PowerServiceIcon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "@/components/theme-toggle";

// Las fases reales de un contrato, en el orden en que se recorren.
const PHASES = ["Nuevo", "En ejecución", "Entregado", "Facturado", "Cobrado"];

function Brand({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 font-mono text-lg font-medium ${className ?? ""}`}>
      <HugeiconsIcon icon={PowerServiceIcon} className="size-8 max-lg:text-foreground" strokeWidth={1.75} />
      Rapisys
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[5fr_4fr]">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Brand />
        <h2 className="max-w-md text-4xl leading-tight font-semibold text-balance">
          Gestión de procesos de contrato
        </h2>
        <ol
          aria-label="Fases de un contrato"
          className="grid grid-cols-5 divide-x divide-primary-foreground/30 border border-primary-foreground/30 text-sm font-medium"
        >
          {PHASES.map((phase) => (
            <li key={phase} className="px-3 py-3">
              {phase}
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
