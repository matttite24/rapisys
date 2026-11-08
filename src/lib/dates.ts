// Fechas como texto "AAAA-MM-DD" (lo que guarda la base). Los cálculos usan UTC,
// así que ni el huso horario ni el cambio de hora corren el día.
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Fecha de entrega: inicio + plazo en días. null si algún dato no es válido.
export function addDaysIso(iso: string, days: number): string | null {
  const m = ISO.exec(iso);
  if (!m || !Number.isInteger(days) || days < 0) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// "2026-11-05" -> "05 nov 2026"
export function formatIso(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-EC", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Hoy (AAAA-MM-DD) en la hora de Ecuador, sin importar dónde corra el servidor.
const ECUADOR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" });
export function todayEcuador(): string {
  return ECUADOR_DAY.format(new Date());
}
