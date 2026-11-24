// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { codesInText, parseSriXml } from "./sri-xml";

// Facturas ficticias (RUC, nombres y montos inventados) con la estructura del SRI.
type Line = { code?: string; description: string; qty: string; total: string; vatCode: string; tarifa?: string; discount?: string };

const detalle = (l: Line) => `
    <detalle>
      ${l.code ? `<codigoPrincipal>${l.code}</codigoPrincipal>` : ""}
      <descripcion>${l.description}</descripcion>
      <cantidad>${l.qty}</cantidad>
      <precioUnitario>0</precioUnitario>
      <descuento>${l.discount ?? "0.00"}</descuento>
      <precioTotalSinImpuesto>${l.total}</precioTotalSinImpuesto>
      <impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>${l.vatCode}</codigoPorcentaje>${
        l.tarifa ? `<tarifa>${l.tarifa}</tarifa>` : ""
      }<baseImponible>${l.total}</baseImponible></impuesto></impuestos>
    </detalle>`;

function factura(o: { ruc: string; estab: string; ptoEmi: string; secuencial: string; fecha: string; guia?: string; subtotal: string; total: string; lines: Line[]; extras: [string, string][] }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ruc>${o.ruc}</ruc><razonSocial>REPUESTOS DE PRUEBA S.A.</razonSocial><nombreComercial>PRUEBA</nombreComercial>
    <claveAcceso>0000000000000000000000000000000000000000000000000</claveAcceso><codDoc>01</codDoc>
    <estab>${o.estab}</estab><ptoEmi>${o.ptoEmi}</ptoEmi><secuencial>${o.secuencial}</secuencial>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${o.fecha}</fechaEmision>
    ${o.guia ? `<guiaRemision>${o.guia}</guiaRemision>` : ""}
    <razonSocialComprador>CLIENTE FICTICIO</razonSocialComprador>
    <identificacionComprador>0999999999001</identificacionComprador>
    <totalSinImpuestos>${o.subtotal}</totalSinImpuestos>
    <importeTotal>${o.total}</importeTotal>
  </infoFactura>
  <detalles>${o.lines.map(detalle).join("")}
  </detalles>
  <infoAdicional>${o.extras.map(([k, v]) => `<campoAdicional nombre="${k}">${v}</campoAdicional>`).join("")}</infoAdicional>
</factura>`;
}

// Comprobante solo: sin códigos de producto, IVA 0 % (código 0) y 15 % (código 4, sin tarifa).
const SIMPLE = factura({
  ruc: "1790000000001",
  estab: "001",
  ptoEmi: "002",
  secuencial: "000000123",
  fecha: "01/10/2026",
  subtotal: "30.50",
  total: "34.10",
  lines: [
    { description: "FILTRO DE ACEITE", qty: "2", total: "10.00", vatCode: "0" },
    { description: "PASTILLAS DE FRENO", qty: "1", total: "20.50", vatCode: "4" },
  ],
  extras: [
    ["VENDEDOR", "V01 PRUEBA"],
    ["EMAIL", "ventas@ejemplo.com"],
    ["FORMA_PAGO", "CREDITO"],
  ],
});

// Autorizada: la factura va en CDATA dentro de <autorizacion>, con códigos repetidos y descuento.
const AUTORIZADA = `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion>
  <estado>AUTORIZADO</estado>
  <numeroAutorizacion>1111111111111111111111111111111111111111111111111</numeroAutorizacion>
  <fechaAutorizacion>2026-05-19T10:00:00-05:00</fechaAutorizacion>
  <comprobante><![CDATA[${factura({
    ruc: "0990000000001",
    estab: "007",
    ptoEmi: "001",
    secuencial: "000000456",
    fecha: "19/05/2026",
    guia: "008-001-000000789",
    subtotal: "260.69",
    total: "299.79",
    lines: [
      { code: "A100", description: "BUJIA", qty: "4", total: "12.00", vatCode: "4", tarifa: "15" },
      { code: "C38100", description: "RODILLO", qty: "63", total: "232.19", vatCode: "4", tarifa: "15", discount: "5.00" },
      { code: "A100", description: "BUJIA", qty: "1.5", total: "16.50", vatCode: "4", tarifa: "15" },
    ],
    extras: [["Correo", "compras@ejemplo.com"]],
  })}]]></comprobante>
</autorizacion>`;

function ok(xml: string) {
  const r = parseSriXml(xml);
  if (!r.ok) throw new Error(r.error);
  return r.invoice;
}

describe("parseSriXml", () => {
  it("lee el comprobante solo (sin códigos de producto, IVA 0 % y 15 %)", () => {
    const f = ok(SIMPLE);
    expect(f.supplier.ruc).toBe("1790000000001");
    expect(f.number).toBe("001-002-000000123");
    expect(f.date).toBe("2026-10-01");
    expect(f.buyer.ruc).toBe("0999999999001");
    expect(f.authorization).toBe("");
    expect(f.lines).toHaveLength(2);
    expect(f.lines.every((l) => l.code === "")).toBe(true);
    expect(f.lines.map((l) => l.vat)).toEqual([0, 15]);
    expect(f.lines[0]).toMatchObject({ quantity: 2, totalCents: 1000, unitCents: 500 });
    expect(f.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(f.subtotalCents);
    expect(f.subtotalCents).toBe(3050);
    expect(f.totalCents).toBe(3410);
    expect(f.notes).toBe("VENDEDOR: V01 PRUEBA · FORMA_PAGO: CREDITO");
  });

  it("lee la factura autorizada (CDATA) con códigos repetidos y descuentos", () => {
    const f = ok(AUTORIZADA);
    expect(f.authorization).toBe("1111111111111111111111111111111111111111111111111");
    expect(f.authorizedAt).toBe("2026-05-19T10:00:00-05:00");
    expect(f.supplier.ruc).toBe("0990000000001");
    expect(f.number).toBe("007-001-000000456");
    expect(f.notes).toBe("Guía de remisión: 008-001-000000789");
    expect(f.notes).not.toContain("@");
    expect(f.lines).toHaveLength(3);
    expect(f.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(f.subtotalCents);
    expect(f.subtotalCents).toBe(26069);
    expect(f.lines[1]).toMatchObject({ code: "C38100", quantity: 63, totalCents: 23219 });
    expect(f.lines[2]).toMatchObject({ quantity: 1.5, unitCents: 1100 });
    const codes = f.lines.map((l) => l.code);
    expect(new Set(codes).size).toBeLessThan(codes.length);
  });

  it("rechaza lo que no es una factura", () => {
    expect(parseSriXml("hola").ok).toBe(false);
    const nc = parseSriXml('<notaCredito><infoTributaria><codDoc>04</codDoc></infoTributaria></notaCredito>');
    expect(nc).toMatchObject({ ok: false, error: expect.stringContaining("nota de crédito") });
    const bad = parseSriXml("<autorizacion><estado>NO AUTORIZADO</estado></autorizacion>");
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining("no está autorizada") });
  });
});

describe("codesInText", () => {
  it("saca números de parte de la descripción", () => {
    expect(codesInText("FF VW CRAFTER CR: FS31180-FCI1273")).toContain("FS31180-FCI1273");
    expect(codesInText("LF GW WINGLE 2022 GW4D20 OEM 1017100ED01")).toEqual(expect.arrayContaining(["GW4D20", "1017100ED01"]));
    expect(codesInText("ORING C3-128..137 3.53MM")).not.toContain("3.53MM");
  });
});
