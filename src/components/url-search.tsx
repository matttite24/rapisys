"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/search-input";
import { cn } from "@/lib/utils";

// Fila de búsqueda de una pantalla: queda fija arriba al desplazarse (así todas las pantallas con búsqueda se comportan igual).
// `top` baja la fila cuando hay otra cosa fija encima (por ejemplo, las pestañas de listas).
export function SearchBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("sticky top-0 z-20 flex h-12 shrink-0 items-stretch border-b bg-popover", className)}>{children}</div>;
}

// Búsqueda de un listado: escribe en la dirección de la página (`?q=`, con pausa corta al escribir) y vuelve a la página 1,
// conservando los demás filtros. La página lee `q` y filtra en el servidor.
export function UrlSearch({ q, label, placeholder }: { q: string; label: string; placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <SearchInput
      label={label}
      placeholder={placeholder}
      defaultValue={q}
      onSearch={(t) => {
        const next = new URLSearchParams(sp);
        if (t) next.set("q", t);
        else next.delete("q");
        next.delete("page");
        router.replace(`${path}?${next}`, { scroll: false });
      }}
    />
  );
}
