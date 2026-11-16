import { expect, it } from "vitest";
import { buildAssetRows, readAssetsCsv, ASSET_COLUMNS } from "@/lib/asset-csv";

const all = new Set(ASSET_COLUMNS.map((c) => c.key));

it("lee tipos por nombre, acepta ; y tildes, y pasa la placa a mayúsculas", () => {
  const read = readAssetsCsv("Tipo;Nombre;Año;Placa\nVehículo liviano;Hilux;2020;abc-123\nmaquinaria;Excavadora;;\n");
  expect(read.error).toBeUndefined();
  const rows = buildAssetRows(read.rows, all);
  expect(rows[0]).toMatchObject({ kind: "light_vehicle", year: "2020", plate: "ABC-123" });
  expect(rows[0].error).toBeUndefined();
  expect(rows[1]).toMatchObject({ kind: "machinery" });
});

it("marca tipo desconocido, año fuera de rango y placa repetida", () => {
  const read = readAssetsCsv("Tipo,Nombre,Año,Placa\nAvión,A,2020,\nliviano,B,1900,\nliviano,C,2020,X1\nliviano,D,2020,x1\n");
  const rows = buildAssetRows(read.rows, all);
  expect(rows.map((r) => !!r.error)).toEqual([true, true, false, true]);
  expect(rows[3].error).toContain("Placa repetida");
});

it("exige las columnas Tipo y Nombre", () => {
  expect(readAssetsCsv("Nombre\nA\n").error).toContain("Tipo");
});
