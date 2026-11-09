import { ThemeToggle } from "@/components/theme-toggle";

// Las fases reales de un contrato, en el orden en que se recorren, con el color de su estado en la app.
const PHASES = [
  { label: "Nuevo", dot: "bg-state-pending" },
  { label: "En ejecución", dot: "bg-state-partial" },
  { label: "Entregado", dot: "bg-state-arriving" },
  { label: "Facturado", dot: "bg-state-stock" },
  { label: "Cobrado", dot: "bg-state-delivered" },
];

// Pantalla de entrada: un solo formulario al centro. Sus cuatro bordes se alargan hasta los límites de la pantalla y el
// formulario es la celda que forman al cruzarse (el mismo lenguaje de líneas finas del marco de la app). Alrededor, un
// plano discreto: puntos que se desvanecen hacia los bordes, rótulos en las esquinas y el recorrido de un contrato.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-background px-4 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(color-mix(in_oklch,var(--foreground)_24%,transparent)_1px,transparent_1.5px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_center,black,transparent)]"
      />

      <p className="caps absolute top-5 left-6 text-muted-foreground">Rapisys</p>
      <div className="absolute top-3 right-3">
        <ThemeToggle variant="ghost" />
      </div>

      {children}

      <div className="absolute inset-x-6 bottom-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="caps text-muted-foreground max-sm:hidden">Gestión de procesos de contrato</p>
        <ol aria-label="Fases de un contrato" className="flex items-center gap-2 text-xs text-muted-foreground">
          {PHASES.map((phase, i) => (
            <li key={phase.label} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-3 bg-foreground/25 sm:w-5" />}
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${phase.dot}`} />
              <span className="max-md:sr-only">{phase.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
