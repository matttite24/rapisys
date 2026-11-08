import { TONE_DOT, type Tone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

// Estado de una línea de lista: círculo de color y etiqueta, sin caja.
export function StateLabel({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}
