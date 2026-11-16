// Enlace de WhatsApp para un teléfono escrito a mano. Sin código de país se asume Ecuador (593).
export function whatsappPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  const intl = d.startsWith("+") || d.startsWith("00");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!intl && !d.startsWith("593")) {
    if (d.startsWith("0")) d = `593${d.slice(1)}`;
    else if (d.length === 9) d = `593${d}`;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function whatsappUrl(raw: string, message?: string): string | null {
  const phone = whatsappPhone(raw);
  if (!phone) return null;
  return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
