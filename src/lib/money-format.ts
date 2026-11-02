// Formato del monto MIENTRAS se escribe: "1250000,5" se muestra "1.250.000,5".
// El valor que viaja al servidor es siempre la forma canónica ("1250000.5": sin
// miles y con punto decimal), que parseCents lee sin ambigüedad.

// 8 dígitos enteros: el máximo es $99.999.999,99, siempre por debajo del tope de money.ts ($100.000.000).
const MAX_INT_DIGITS = 8;

export type Typed = { int: string; frac: string; decimal: boolean };

// Interpreta lo que hay en el campo, sea lo que se tecleó, se pegó o ya está formateado.
export function parseTyped(text: string): Typed {
  const t = text.replace(/[^\d.,]/g, "");
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");

  let sep = -1; // posición del separador decimal
  if (lastComma >= 0 && lastDot >= 0) sep = Math.max(lastComma, lastDot); // el último manda
  else if (lastComma >= 0) sep = lastComma;
  else if (lastDot >= 0) {
    // Con solo puntos: son de miles si todos los grupos tienen 3 dígitos; si no, el último es decimal.
    sep = /^\d{1,3}(\.\d{3})+$/.test(t) ? -1 : lastDot;
  }

  const digits = (s: string) => s.replace(/\D/g, "");
  const intRaw = digits(sep >= 0 ? t.slice(0, sep) : t);
  const int = intRaw.replace(/^0+(?=\d)/, "").slice(0, MAX_INT_DIGITS);
  if (sep < 0) return { int, frac: "", decimal: false };
  return { int: int || "0", frac: digits(t.slice(sep + 1)).slice(0, 2), decimal: true };
}

export function formatTyped({ int, frac, decimal }: Typed): string {
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal ? `${grouped},${frac}` : grouped;
}

// "1250.5": lo que se envía. Un coma final ("1.250,") aún no tiene decimales: es "1250".
export function canonicalOf({ int, frac }: Typed): string {
  return int ? `${int}${frac ? `.${frac}` : ""}` : "";
}

export const fromCanonical = (value: string): Typed =>
  value ? parseTyped(value.replace(".", ",")) : { int: "", frac: "", decimal: false };
