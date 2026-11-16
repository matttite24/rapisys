"use client";

import { usePathname, useRouter } from "next/navigation";
import { SearchInput } from "@/components/search-input";

// Subencabezado del listado: búsqueda (va al servidor, con pausa corta al escribir).
export function ContractToolbar({ q }: { q: string }) {
  const router = useRouter();
  const path = usePathname();

  return (
    <div className="sticky top-0 z-20 flex h-12 items-stretch border-b bg-popover">
      <SearchInput
        label="Buscar procesos"
        placeholder="Buscar por código o nombre del proceso"
        defaultValue={q}
        onSearch={(t) => {
          const next = new URLSearchParams(window.location.search);
          if (t) next.set("q", t);
          else next.delete("q");
          next.delete("page");
          router.replace(`${path}?${next}`, { scroll: false });
        }}
      />
    </div>
  );
}
