import { parseCents } from "@/lib/money";

export function readQuotation(form: FormData) {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const values = {
    internalCode: text("internalCode"), supplier: text("supplier"), phone: text("phone"), email: text("email"), note: text("note"),
    availability: text("availability"), leadTime: text("leadTime"), proformaUrl: text("proformaUrl"),
  };
  if (!values.note) return { error: "Escribe el resultado de la gestión o el siguiente paso." };
  const limits = { internalCode: 60, supplier: 200, phone: 50, email: 200, note: 5000, availability: 300, leadTime: 300, proformaUrl: 2000 };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (values[key].length > limits[key]) return { error: `El campo supera el máximo de ${limits[key]} caracteres.` };
  }
  if (values.proformaUrl) {
    try {
      const url = new URL(values.proformaUrl);
      if (!["https:", "http:"].includes(url.protocol) || /\s/.test(values.proformaUrl)) throw new Error();
    } catch {
      return { error: "Escribe un enlace válido a la proforma (https://…)." };
    }
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: "Escribe un correo válido." };
  const supplierId = text("supplierId");
  if (supplierId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId)) return { error: "Proveedor no válido." };
  const rawCost = text("unitCost");
  const cost = rawCost ? parseCents(rawCost) : null;
  if (cost && !cost.ok) return { error: cost.error };
  return { values: { ...values, supplierId: supplierId || null, saveSupplier: text("saveSupplier") === "on", unitCostCents: cost?.cents ?? null } };
}
