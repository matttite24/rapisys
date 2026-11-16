import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { TONE_CLASS, TONE_SOLID } from "@/lib/state-tone"
import { cn } from "@/lib/utils"

const CHIP = "rounded-sm px-2.5 py-0.5 text-xs font-medium tracking-normal normal-case"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border-0 bg-transparent px-0 py-0 text-[0.625rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-0 has-data-[icon=inline-start]:pl-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "text-foreground [a]:hover:text-foreground/70",
        secondary: "text-muted-foreground [a]:hover:text-foreground",
        destructive:
          "text-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:text-destructive/70",
        outline: "text-foreground [a]:hover:text-foreground/70",
        ghost: "text-muted-foreground hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        // Estados: chip con tinte y texto del tono (ver lib/state-tone.ts). Anulan el estilo base de solo texto.
        pending: `${CHIP} ${TONE_CLASS.pending}`,
        partial: `${CHIP} ${TONE_CLASS.partial}`,
        arriving: `${CHIP} ${TONE_CLASS.arriving}`,
        stock: `${CHIP} ${TONE_CLASS.stock}`,
        delivered: `${CHIP} ${TONE_CLASS.delivered}`,
        running: `${CHIP} ${TONE_CLASS.running}`,
        quoted: `${CHIP} ${TONE_CLASS.quoted}`,
        // Relleno pleno (estado de las facturas).
        "solid-pending": `${CHIP} ${TONE_SOLID.pending}`,
        "solid-partial": `${CHIP} ${TONE_SOLID.partial}`,
        "solid-arriving": `${CHIP} ${TONE_SOLID.arriving}`,
        "solid-stock": `${CHIP} ${TONE_SOLID.stock}`,
        "solid-delivered": `${CHIP} ${TONE_SOLID.delivered}`,
        "solid-running": `${CHIP} ${TONE_SOLID.running}`,
        "solid-quoted": `${CHIP} ${TONE_SOLID.quoted}`,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
