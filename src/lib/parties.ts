// Catálogos con la misma forma (nombre, RUC, dirección): clientes, proveedores y responsables.
export const PARTIES = {
  clients: {
    table: "clients",
    path: "clientes",
    singular: "cliente",
    plural: "clientes",
    heading: "Clientes",
    newLabel: "Nuevo cliente",
    empty: "Todavía no hay clientes.",
  },
  suppliers: {
    table: "suppliers",
    path: "proveedores",
    singular: "proveedor",
    plural: "proveedores",
    heading: "Proveedores",
    newLabel: "Nuevo proveedor",
    empty: "Todavía no hay proveedores.",
  },
  managers: {
    table: "contract_managers",
    path: "responsables",
    singular: "responsable",
    plural: "responsables",
    heading: "Responsables de Contrato",
    newLabel: "Nuevo responsable",
    empty: "Todavía no hay responsables.",
  },
} as const;

export type PartyKind = keyof typeof PARTIES;

export type Party = { id: string; name: string; ruc: string | null; address: string | null };

// RUC (13 dígitos) o cédula (10): opcional, pero si se escribe debe ser válido en forma.
export function rucError(value: string): string | null {
  if (!value) return null;
  return /^\d{10}(\d{3})?$/.test(value)
    ? null
    : "Escribe solo números: 13 dígitos para un RUC o 10 para una cédula.";
}
