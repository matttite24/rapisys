

// Una lista de referencia del proceso: los datos del activo al que sirve.
export type ListView = {
  id: string;
  assetId: string | null;
  name: string;
  // Cuántas líneas tiene la lista (sin cargarlas).
  count: number;
  // Datos del activo del catálogo (vacíos en una lista general).
  kind: string;
  brand: string;
  model: string;
  serial: string;
  engine: string;
  year: string;
  identifier: string;
  other: string;
  plate: string;
};
