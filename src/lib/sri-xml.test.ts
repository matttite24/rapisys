// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codesInText, parseSriXml } from "./sri-xml";

const sample = (name: string) => readFileSync(path.resolve(import.meta.dirname, "../../docs", name), "utf-8");

function ok(name: string) {
  const r = parseSriXml(sample(name));
  if (!r.ok) throw new Error(r.error);
  return r.invoice;
}

describe("parseSriXml", () => {
  it("lee el comprobante solo (sin códigos de producto, IVA 0 % y 15 %)", () => {
    const f = ok("Factura.xml");
    expect(f.supplier.ruc).toBe("1691729045001");
    expect(f.number).toBe("001-002-000006882");
    expect(f.date).toBe("2026-10-01");
    expect(f.buyer.ruc).toBe("1600412769001");
    expect(f.lines).toHaveLength(16);
    expect(f.lines.every((l) => l.code === "")).toBe(true);
    expect(new Set(f.lines.map((l) => l.vat))).toEqual(new Set([0, 15]));
    expect(f.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(f.subtotalCents);
    expect(f.subtotalCents).toBe(44822);
    expect(f.totalCents).toBe(50150);
    expect(f.notes).toBe("CONTROL: 0001000006882 · VENDEDOR: G001 ELVIA · FORMA_PAGO: CREDITO · FECHA_VENCIMIENTO: 31/10/2026");
  });

  it("lee la factura autorizada (CDATA) con 142 líneas, códigos repetidos y descuentos", () => {
    const f = ok("Factura-2.xml");
    expect(f.authorization).toBe("1905202601099065849800120070010001202760000000014");
    expect(f.supplier.ruc).toBe("0990658498001");
    expect(f.number).toBe("007-001-000120276");
    expect(f.notes).toContain("Guía de remisión: 008-001-000234458");
    expect(f.notes).not.toContain("@");
    expect(f.lines).toHaveLength(142);
    expect(f.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(f.subtotalCents);
    expect(f.subtotalCents).toBe(1679793);
    expect(f.lines[1]).toMatchObject({ code: "C38100", quantity: 63, totalCents: 23219 });
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
