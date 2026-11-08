"use client";

import { SearchInput } from "@/components/search-input";

// Búsqueda dentro de la lista abierta: ocupa la fila desde el inicio. Va al servidor (con una pausa corta al escribir) y
// vuelve a la página 1.
export function LineSearch({
  q,
  onSearch,
  placeholder = "Buscar por número de parte o descripción",
}: {
  q: string;
  onSearch: (q: string) => void;
  placeholder?: string;
}) {
  return <SearchInput label="Buscar en la lista" defaultValue={q} onSearch={onSearch} placeholder={placeholder} />;
}
