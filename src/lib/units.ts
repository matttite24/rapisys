// Unidades de medida de una línea de proceso. Se guarda la clave, no la etiqueta.
export const UNITS = {
  unit: "Unidad",
  set: "Juego",
  pair: "Par",
  box: "Caja",
  liter: "Litro",
  gallon: "Galón",
  meter: "Metro",
  kg: "Kilogramo",
} as const;
export type Unit = keyof typeof UNITS;

export const isUnit = (v: string): v is Unit => Object.hasOwn(UNITS, v);
export const unitLabel = (v: string) => (isUnit(v) ? UNITS[v] : v);
