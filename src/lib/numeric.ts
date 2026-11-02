// Campos numéricos: se descarta todo lo que no sea número mientras se escribe.

// Solo dígitos (años, plazo en días, RUC).
export const digitsOnly = (text: string, maxLength?: number) =>
  text.replace(/\D/g, "").slice(0, maxLength);

// Dígitos y un único separador decimal (coma o punto), con un máximo de decimales.
// Cantidades y porcentajes: "12", "2,5", "0.25".
export function sanitizeDecimal(text: string, maxDecimals = 2): string {
  const cleaned = text.replace(/[^\d.,]/g, "");
  const i = cleaned.search(/[.,]/);
  if (i < 0) return cleaned;
  const sep = cleaned[i];
  const int = cleaned.slice(0, i);
  const frac = cleaned.slice(i + 1).replace(/\D/g, "").slice(0, maxDecimals);
  return maxDecimals > 0 ? `${int}${sep}${frac}` : int;
}
