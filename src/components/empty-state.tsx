import { cn } from "@/lib/utils";

// Imagen de las búsquedas sin resultado (public/Dummies).
export const NO_RESULTS_IMAGE = "image-1vm53OGKOAbv1TfZZlygDMb4Z4FYoH";

// Estado vacío de una lista: una imagen de ejemplo (public/Dummies), el mensaje y, si hay, la acción.
export function EmptyState({
  image,
  children,
  action,
  className,
  fill,
}: {
  image: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  // Ocupa el alto que deja la pantalla (encabezado, buscador y pie) y se centra: para listas que no tienen nada más debajo.
  fill?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-16 text-center", fill && "min-h-[calc(100svh-9.75rem)] justify-center py-8", className)}>
      {/* alt vacío: es decorativa, el mensaje ya dice lo que pasa. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/Dummies/${encodeURIComponent(image)}.avif`} alt="" className="size-40 object-contain" />
      <p className="max-w-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
