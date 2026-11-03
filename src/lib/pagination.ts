// Los listados se piden por páginas: nunca se carga una tabla completa, y así
// tampoco se corta en silencio en el tope de filas de la API.
export const PAGE_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;

export function readPage(search: Search): number {
  const raw = Array.isArray(search.page) ? search.page[0] : search.page;
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// Rango [desde, hasta] (incluyente) de una página, para `.range()`.
export const pageRange = (page: number, size = PAGE_SIZE): [number, number] => [
  (page - 1) * size,
  page * size - 1,
];

export const pageCount = (total: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size));
