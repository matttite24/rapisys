"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/search-input";

// Subencabezado del listado: búsqueda (va al servidor, con pausa corta al escribir).
export function ContractToolbar({ q }: { q: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  return (
    <div className="sticky top-0 z-20 flex h-12 items-stretch border-b bg-popover">
      <SearchInput
        label="Buscar contratos"
        placeholder="Buscar por código o nombre del contrato"
        defaultValue={q}
        onSearch={(t) => {
          const next = new URLSearchParams(sp);
          if (t) next.set("q", t);
          else next.delete("q");
          next.delete("page");
          router.replace(`${path}?${next}`, { scroll: false });
        }}
      />
    </div>
  );
}
