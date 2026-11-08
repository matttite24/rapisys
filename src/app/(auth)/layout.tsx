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

// La pantalla de entrada es el marco de la app sin su contenido: fila superior con la marca y el tema entre líneas finas,
// y el formulario como una celda sobre la capa gris.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-layer-2">
      <header className="flex h-15 shrink-0 items-stretch border-b bg-background">
        <div className="grid w-16 shrink-0 place-items-center bg-brand text-brand-foreground">
          <HugeiconsIcon icon={PowerServiceIcon} aria-hidden className="size-6" strokeWidth={2} />
        </div>
        <p className="flex min-w-0 flex-1 items-center px-6 font-mono text-lg font-medium">Rapisys</p>
        <div className="grid w-16 shrink-0 place-items-center border-l [&_button]:size-full [&_button]:rounded-none">
          <ThemeToggle variant="ghost" />
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-10">
        {children}
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="caps text-muted-foreground">Gestión de procesos de contrato</p>
          <ol aria-label="Fases de un contrato" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {PHASES.map((phase) => (
              <li key={phase.label} className="flex items-center gap-2">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${phase.dot}`} />
                {phase.label}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
