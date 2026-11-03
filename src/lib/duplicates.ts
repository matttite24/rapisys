// Detección de duplicados al cargar una lista: dentro de lo que se va a cargar y contra lo
// que la lista ya tiene. La clave es el número de parte (sin espacios, guiones ni mayúsculas);
// si la fila no lo trae, la descripción.

export type Dup = { kind: "batch"; ref: number } | { kind: "existing"; ref: number };

type Item = { part: string; description: string };

const norm = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");

export function dupKey(item: Item): string {
  const part = norm(item.part);
  return part ? `P:${part}` : `D:${norm(item.description)}`;
}

// Por cada fila: null si es única; si no, a qué se parece. `ref` es posición 1-based: la fila
// anterior del lote (kind "batch") o la línea de la lista actual (kind "existing").
export function findDuplicates(rows: Item[], existing: Item[]): (Dup | null)[] {
  const inList = new Map<string, number>();
  existing.forEach((e, i) => {
    const k = dupKey(e);
    if (k !== "D:" && !inList.has(k)) inList.set(k, i + 1);
  });

  const first = new Map<string, number>();
  return rows.map((r, i) => {
    const k = dupKey(r);
    if (k === "D:") return null; // fila vacía: no hay con qué comparar
    const line = inList.get(k);
    if (line) return { kind: "existing", ref: line };
    const before = first.get(k);
    if (before !== undefined) return { kind: "batch", ref: before };
    first.set(k, i + 1);
    return null;
  });
}
