// Dinero en centavos enteros: $10 es 1000. Nunca se opera con decimales de JavaScript.
// Todas las funciones reciben y devuelven enteros; el redondeo (mitad hacia arriba)
// ocurre una sola vez por cálculo y con aritmética entera exacta.

export type Cents = number;

// Tope por monto ($100.000.000): mantiene los productos intermedios por debajo
// de 2^53, así que la aritmética entera es exacta.
export const MAX_CENTS = 10_000_000_000;

const fmt = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

// c es entero, así que c / 100 se imprime siempre con sus dos decimales exactos.
export const formatCents = (c: Cents) => fmt.format(c / 100);

// Para precargar un campo de texto: 125050 -> "1250.50".
export function centsToInput(c: Cents): string {
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export type CentsResult =
  | { ok: true; cents: Cents; error?: undefined }
  | { ok: false; cents?: undefined; error: string };

// Lee un monto escrito por una persona. Acepta "1250", "1250,50", "1.250,50",
// "1,250.50" y "$ 1250.5". Lo que pueda leerse de dos maneras ("1.250", "1,250")
// se rechaza: un error visible es mejor que un monto mil veces menor.
export function parseCents(raw: string): CentsResult {
  const s = raw.replace(/[\s$]/g, "");
  if (!s) return { ok: false, error: "Escribe un monto." };
  if (!/^[\d.,]+$/.test(s)) return { ok: false, error: "Usa solo números, por ejemplo 1250,50." };

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const dec = Math.max(lastDot, lastComma); // posición del último separador
  let intPart = s;
  let frac = "";

  if (dec >= 0) {
    const sep = s[dec];
    const sameCount = s.split(sep).length - 1;
    const mixed = lastDot >= 0 && lastComma >= 0;

    if (mixed || sameCount === 1) {
      intPart = s.slice(0, dec);
      frac = s.slice(dec + 1);
      if (!mixed && frac.length === 3 && /^[1-9]\d{0,2}$/.test(intPart)) {
        return { ok: false, error: `"${s}" se puede leer de dos maneras. Escribe ${intPart}${frac} o ${intPart}${frac},00.` };
      }
      if (frac.length === 0) return { ok: false, error: "Quita el separador final o escribe los decimales." };
      if (frac.length > 2) return { ok: false, error: "Usa como máximo 2 decimales." };
    }
    // Un mismo separador repetido (1.250.000) solo puede ser de miles: sin decimales.
  }

  if (/[.,]/.test(intPart)) {
    const groups = /^\d{1,3}([.,]\d{3})+$/.test(intPart) && new Set(intPart.match(/[.,]/g)).size === 1;
    if (!groups) return { ok: false, error: "Los miles se separan de a tres dígitos, por ejemplo 1.250.000." };
    intPart = intPart.replace(/[.,]/g, "");
  }

  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    return { ok: false, error: "El monto es demasiado grande." };
  }
  return { ok: true, cents };
}

// Cantidades y porcentajes (no son dinero): hasta `maxDecimals` decimales, con coma o punto.
export function parseDecimal(raw: string, maxDecimals = 2): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  if ((s.split(".")[1] ?? "").length > maxDecimals) return null;
  return Number(s);
}

// 15 (%) -> 1500 puntos base. Los porcentajes tienen a lo sumo 2 decimales.
const toBp = (percent: number) => Math.round(percent * 100);

// Redondeo de mitad hacia arriba sobre un numerador entero: floor((n + d/2) / d).
const roundDiv = (n: number, d: number) => Math.floor((n + d / 2) / d);

// El total incluye IVA: se desglosa en subtotal e IVA. subtotal + iva = total, siempre.
export function splitVat(totalCents: Cents, ratePercent: number) {
  const subtotal = roundDiv(totalCents * 10_000, 10_000 + toBp(ratePercent));
  return { subtotal, vat: totalCents - subtotal };
}

// Una línea: cantidad (hasta 2 decimales) por precio unitario sin IVA.
// Cada línea se redondea una vez; los totales son sumas de estos enteros,
// por eso las filas siempre suman exactamente el total mostrado.
export function lineAmounts(quantity: number, unitCents: Cents, vatPercent: number) {
  const subtotal = roundDiv(Math.round(quantity * 100) * unitCents, 100);
  const vat = roundDiv(subtotal * toBp(vatPercent), 10_000);
  return { subtotal, vat, total: subtotal + vat };
}

export const withVatCents = (costCents: Cents, vatPercent: number) =>
  costCents + roundDiv(costCents * toBp(vatPercent), 10_000);

// Precio de venta sin IVA: costo + margen de utilidad sobre el costo.
export const salePriceCents = (costCents: Cents, marginPercent: number) =>
  roundDiv(costCents * (10_000 + toBp(marginPercent)), 10_000);
