import { describe, expect, it } from "vitest";
import { whatsappPhone, whatsappUrl } from "./whatsapp";

describe("whatsapp", () => {
  it("normaliza celulares de Ecuador", () => {
    expect(whatsappPhone("0991234567")).toBe("593991234567");
    expect(whatsappPhone("099 123-4567")).toBe("593991234567");
    expect(whatsappPhone("991234567")).toBe("593991234567");
    expect(whatsappPhone("+593 99 123 4567")).toBe("593991234567");
  });
  it("respeta otros países y rechaza textos sin teléfono", () => {
    expect(whatsappPhone("+1 305 555 0100")).toBe("13055550100");
    expect(whatsappPhone("correo@ejemplo.com")).toBeNull();
    expect(whatsappPhone("123")).toBeNull();
  });
  it("arma el enlace con el mensaje codificado", () => {
    expect(whatsappUrl("0991234567", "Hola ñ")).toBe("https://wa.me/593991234567?text=Hola%20%C3%B1");
  });
});
