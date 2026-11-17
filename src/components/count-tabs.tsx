import { cn } from "@/lib/utils";

// Pestañas de texto con contador: la activa en negrita, el resto en gris, el número en una etiqueta pequeña.
export const TAB = (active: boolean) =>
  cn(
    "-mb-px inline-flex items-center gap-2 border-b-[3px] pb-2.5 text-sm transition-colors",
    active ? "border-brand font-bold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
  );

// Contador de una pestaña. Con `active`, en amarillo (solo la pestaña activa lleva color).
export function TabCount({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "num rounded-sm px-1.5 py-0.5 text-xs font-medium",
        active ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/80",
      )}
    >
      {n}
    </span>
  );
}

export const TABS_ROW = "flex flex-wrap items-end gap-x-6 gap-y-2 border-b px-6 pt-3";
