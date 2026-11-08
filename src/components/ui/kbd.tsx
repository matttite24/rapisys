import { cn } from "@/lib/utils"

// `soft`: sin borde y con un tinte suave; es la tecla de las barras de atajos y del menú.
function Kbd({ className, soft, ...props }: React.ComponentProps<"kbd"> & { soft?: boolean }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-md border bg-background px-1 font-mono text-2xs font-medium text-muted-foreground select-none",
        soft && "border-0 bg-foreground/[0.07] font-normal",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
