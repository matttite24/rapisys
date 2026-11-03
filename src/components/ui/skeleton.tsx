import { cn } from "@/lib/utils";

// Marcador de posición mientras llegan los datos: una barra apagada que late suavemente.
// Se anima solo si la persona no pidió reducir el movimiento.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("bg-muted motion-safe:animate-pulse", className)} {...props} />;
}

export { Skeleton };
