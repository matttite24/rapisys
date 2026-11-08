// Lector de facturas electrónicas del SRI (Ecuador). Función pura: recibe el texto del XML y devuelve
// los datos que usa el formulario de compras, o un motivo de rechazo. Sin dependencias; usa DOMParser
// (no resuelve entidades externas). El archivo es externo: todo se trata como datos, nunca como HTML.

export const MAX_XML_BYTES = 2 * 1024 * 1024;
export const MAX_XML_LINES = 1000;

export type SriLine = {
  code: string; // codigoPrincipal (código del proveedor); vacío si no viene
  auxCode: string;
  description: string;
  quantity: number; // hasta 2 decimales
  totalCents: number; // precioTotalSinImpuesto: manda sobre cantidad x precio
  unitCents: number; // totalCents / cantidad, redondeado (referencia)
  vat: number; // IVA %
};

export type SriInvoice = {
  accessKey: string;
  authorization: string; // número de autorización; vacío si el comprobante no vino autorizado
  authorizedAt: string; // fechaAutorizacion tal como viene (ISO con huso); vacío si no vino autorizado
  supplier: { ruc: string; name: string; tradeName: string };
  notes: string; // detalle de infoAdicional y guía de remisión, para las notas de la factura (máx. 500)
  number: string; // 001-001-000123456
  date: string; // aaaa-mm-dd
  buyer: { ruc: string; name: string };
  subtotalCents: number; // totalSinImpuestos
  totalCents: number; // importeTotal
  lines: SriLine[];
};

export type SriResult = { ok: true; invoice: SriInvoice } | { ok: false; error: string };

// codigoPorcentaje del IVA -> %. Se usa solo si la línea no trae `tarifa`.
const VAT_BY_CODE: Record<string, number> = { "0": 0, "2": 12, "3": 14, "4": 15, "5": 5, "6": 0, "7": 0, "10": 13 };

const DOC_TYPES: Record<string, string> = {
  "04": "una nota de crédito",
  "05": "una nota de débito",
  "06": "una guía de remisión",
  "07": "un comprobante de retención",
  "03": "una liquidación de compra",
};

const clip = (s: string, max = 300) => s.replace(/\s+/g, " ").trim().slice(0, max);
const toCents = (s: string) => Math.round(Number(s) * 100);

function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

// Texto del primer descendiente con ese nombre dentro de `scope` ("" si no existe).
function first(scope: Element | Document, tag: string): string {
  return scope.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

export function parseSriXml(text: string): SriResult {
  if (text.length > MAX_XML_BYTES) return { ok: false, error: "El archivo es demasiado grande (máximo 2 MB)." };
  const not = { ok: false as const, error: "El archivo no es un XML de factura válido." };

  let doc = parseXml(text.replace(/^﻿/, ""));
  if (!doc) return not;

  // Autorizado: la factura viene como texto dentro de <comprobante>; hay que leerla otra vez.
  let authorization = "";
  let authorizedAt = "";
  if (doc.documentElement.localName === "autorizacion") {
    const estado = first(doc, "estado");
    if (estado && estado !== "AUTORIZADO") return { ok: false, error: `La factura no está autorizada (estado: ${clip(estado, 40)}).` };
    authorization = first(doc, "numeroAutorizacion");
    authorizedAt = first(doc, "fechaAutorizacion");
    const inner = first(doc, "comprobante");
    const innerDoc = inner && parseXml(inner);
    if (!innerDoc) return not;
    doc = innerDoc;
  }

  const root = doc.documentElement;
  if (root.localName !== "factura") {
    const kind = DOC_TYPES[first(doc, "codDoc")];
    return { ok: false, error: kind ? `Este archivo es ${kind}, no una factura.` : not.error };
  }
  if (first(root, "codDoc") && first(root, "codDoc") !== "01") return { ok: false, error: "Este archivo no es una factura (codDoc ≠ 01)." };

  const info = root.getElementsByTagName("infoTributaria")[0];
  const fact = root.getElementsByTagName("infoFactura")[0];
  if (!info || !fact) return not;

  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(first(fact, "fechaEmision"));
  const number = [first(info, "estab"), first(info, "ptoEmi"), first(info, "secuencial")].join("-");
  if (!date || !/^\d{3}-\d{3}-\d{9}$/.test(number)) return { ok: false, error: "La factura no trae fecha o número válidos." };

  const detalles = [...root.getElementsByTagName("detalle")];
  if (!detalles.length) return { ok: false, error: "La factura no tiene líneas." };
  if (detalles.length > MAX_XML_LINES) return { ok: false, error: `La factura tiene más de ${MAX_XML_LINES} líneas.` };

  const lines: SriLine[] = [];
  for (const [i, d] of detalles.entries()) {
    const qty = Number(first(d, "cantidad"));
    const total = first(d, "precioTotalSinImpuesto");
    if (!(qty > 0) || !Number.isFinite(Number(total)) || Number(total) < 0) {
      return { ok: false, error: `La línea ${i + 1} tiene cantidad o valor inválidos.` };
    }
    // IVA: el impuesto con codigo 2; si trae tarifa se usa, si no, se deduce del código.
    const iva = [...d.getElementsByTagName("impuesto")].find((x) => first(x, "codigo") === "2");
    const tarifa = iva ? first(iva, "tarifa") : "";
    const vat = tarifa !== "" && Number.isFinite(Number(tarifa)) ? Number(tarifa) : (VAT_BY_CODE[iva ? first(iva, "codigoPorcentaje") : "0"] ?? 0);
    const quantity = Math.round(qty * 100) / 100;
    const totalCents = toCents(total);
    lines.push({
      code: clip(first(d, "codigoPrincipal"), 60),
      auxCode: clip(first(d, "codigoAuxiliar"), 60),
      description: clip(first(d, "descripcion")),
      quantity,
      totalCents,
      unitCents: Math.round(totalCents / quantity),
      vat,
    });
  }

  // Detalle del proveedor (vendedor, forma de pago, vencimiento…), sin correos; cabe en las notas del sistema.
  const extras = [...root.getElementsByTagName("campoAdicional")]
    .map((c) => [clip(c.getAttribute("nombre") ?? "", 60), clip(c.textContent ?? "", 120)] as const)
    .filter(([k, v]) => k && v && !/mail|correo/i.test(k) && !v.includes("@"))
    .map(([k, v]) => `${k}: ${v}`);
  const guia = first(fact, "guiaRemision");
  if (guia) extras.unshift(`Guía de remisión: ${guia}`);

  return {
    ok: true,
    invoice: {
      notes: extras.join(" · ").slice(0, 500),
      accessKey: first(info, "claveAcceso"),
      authorization,
      authorizedAt,
      supplier: { ruc: first(info, "ruc"), name: clip(first(info, "razonSocial")), tradeName: clip(first(info, "nombreComercial")) },
      number,
      date: `${date[3]}-${date[2]}-${date[1]}`,
      buyer: { ruc: first(fact, "identificacionComprador"), name: clip(first(fact, "razonSocialComprador")) },
      subtotalCents: toCents(first(fact, "totalSinImpuestos")),
      totalCents: toCents(first(fact, "importeTotal")),
      lines,
    },
  };
}

// Posibles números de parte dentro de una descripción ("... CR: FS31180-FCI1273", "OEM 1017100ED01"):
// palabras de 4+ caracteres con al menos un dígito. Sirve cuando la factura no trae código.
export function codesInText(text: string): string[] {
  const out = new Set<string>();
  for (const w of text.toUpperCase().split(/[\s:,;()]+/)) {
    const t = w.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
    if (t.length >= 4 && /\d/.test(t) && !/^\d+(\.\d+)?(MM|CM|M|KG|L|CC)?$/.test(t)) out.add(t);
  }
  return [...out];
}
