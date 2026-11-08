import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { pageCount } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Navegación entre páginas de un listado. `params` conserva otros filtros (p. ej. la búsqueda).
export function Pager({
  basePath,
  page,
  total,
  params = {},
  size,
  always,
  className,
}: {
  basePath: string;
  page: number;
  total: number;
  params?: Record<string, string>;
  size?: number;
  // Se muestra aunque haya una sola página.
  always?: boolean;
  className?: string;
}) {
  const pages = pageCount(total, size);
  if (pages <= 1 && !always) return null;

  const href = (p: number) => {
    const q = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${q}`;
  };
  const btn = buttonVariants({ variant: "outline" }) + " min-h-11 sm:min-h-10";

  return (
    <nav aria-label="Páginas" className={cn("flex items-center justify-between gap-4 border-t px-6 py-3", className)}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={btn} rel="prev">← Anterior</Link>
      ) : (
        <span />
      )}
      <span className="caps-md text-muted-foreground">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={btn} rel="next">Siguiente →</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
