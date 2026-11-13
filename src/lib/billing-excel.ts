// Libros de Excel del reporte de cobro: el de una entrega revisada, y el consolidado de todas las entregas (hojas Resumen y
// Detalle). Cada fila lleva fecha de entrega, activo relacionado, costo, margen, valor final y utilidad.
import ExcelJS from "exceljs";
import { billingRow } from "@/lib/billing";
import { ALL_BILLING_COLUMNS, ALL_CONSOLIDATED_COLUMNS, BILLING_COLUMNS, type BillingColumnKey } from "@/lib/billing-columns";

export type BillingExcelLine = {
  description: string;
  part_number: string | null;
  quantity: number;
  unit: string;
  referenceCents: number | null;
  costCents: number;
  sources: number;
  unknown: number;
  marginOverride: number | null;
  excluded: boolean;
  // Activos (vehículos o maquinaria) con los que se relaciona el producto de la línea; vacío si ninguno.
  assets?: string[];
};

export type BillingExcelInput = {
  contract: { code: string; name: string; client: string };
  delivery: { code: string; date: string; dateIso: string; list: string; receivedBy: string | null; voided: boolean };
  lines: BillingExcelLine[];
  // Columnas a exportar (en el orden del reporte); sin indicar, todas.
  columns?: BillingColumnKey[];
};

export type ConsolidatedDelivery = { code: string; date: string; dateIso: string; list: string; receivedBy: string | null; lines: BillingExcelLine[] };
export type ConsolidatedInput = {
  contract: { code: string; name: string; client: string };
  deliveries: ConsolidatedDelivery[];
  columns?: BillingColumnKey[];
};

const USD = '"$"#,##0.00';
const dollars = (cents: number) => cents / 100;
type Key = BillingColumnKey;

type DetailRow = { delivery: string; dateIso: string; line: BillingExcelLine };

const calcOf = (l: BillingExcelLine) =>
  billingRow({ costCents: l.costCents, referenceCents: l.referenceCents, sources: l.sources, marginOverride: l.marginOverride, excluded: l.excluded });

// Tabla de líneas con totales (una hoja). `info` son los datos de arriba; la tabla empieza en la fila 9.
function addDetailSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  info: [string, string][],
  rows: DetailRow[],
  columns: BillingColumnKey[],
  extraNotes: string[],
  filter = false,
) {
  const COLS = BILLING_COLUMNS.filter((c) => columns.includes(c.key));
  const has = (k: Key) => COLS.some((c) => c.key === k);
  const idx = (k: Key) => COLS.findIndex((c) => c.key === k) + 1;
  const headRow = 2 + info.length + 1;
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: headRow }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }));
  const L = (k: Key) => ws.getColumn(idx(k)).letter;
  const lastLetter = ws.getColumn(COLS.length).letter;

  // Con pocas columnas no se combinan celdas (no cabe etiqueta y valor).
  const wide = COLS.length >= 4;
  if (lastLetter !== "A") ws.mergeCells(`A1:${lastLetter}1`);
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14 };
  info.forEach(([label, value], i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).font = { bold: true };
    if (wide) {
      row.getCell(1).value = label;
      ws.mergeCells(`A${2 + i}:B${2 + i}`);
      ws.mergeCells(`C${2 + i}:${lastLetter}${2 + i}`);
      row.getCell(3).value = value;
    } else if (COLS.length >= 2) {
      row.getCell(1).value = label;
      row.getCell(2).value = value;
    } else {
      row.getCell(1).value = `${label}: ${value}`;
    }
  });

  const head = ws.getRow(headRow);
  COLS.forEach((col, i) => {
    const c = head.getCell(i + 1);
    c.value = col.title;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    c.alignment = { horizontal: col.right ? "right" : "left", vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin" } };
  });

  // Solo las líneas que cuentan: incluidas, con costo conocido y valor final.
  const counted = rows.map((r) => ({ r, calc: calcOf(r.line) })).filter((x) => x.calc.counts);
  const omitted = rows.length - counted.length;

  const first = headRow + 1;
  counted.forEach(({ r: { line: l, delivery, dateIso }, calc }, i) => {
    const rowNo = first + i;
    const row = ws.getRow(rowNo);
    const set = (k: Key, v: ExcelJS.CellValue) => { if (has(k)) row.getCell(idx(k)).value = v; };
    set("n", i + 1);
    set("delivery", delivery);
    // Fecha de entrega como fecha de Excel (medianoche UTC: no se corre de día por el huso horario).
    set("date", new Date(`${dateIso}T00:00:00Z`));
    set("part", l.part_number ?? "");
    set("desc", l.description);
    set("asset", l.assets && l.assets.length > 0 ? l.assets.join("; ") : "—");
    set("qty", l.quantity);
    set("unit", l.unit);
    set("cost", dollars(l.costCents));
    // Margen: el ajustado o, si no se tocó, el real (utilidad ÷ costo).
    set("margin", calc.marginPct === null ? null : calc.marginPct / 100);
    set("final", dollars(calc.finalCents ?? 0));
    // Con costo y valor final en la hoja, la utilidad es una fórmula; si falta alguno, queda el valor.
    set("profit", has("cost") && has("final")
      ? { formula: `${L("final")}${rowNo}-${L("cost")}${rowNo}`, result: dollars(calc.profitCents ?? 0) }
      : dollars(calc.profitCents ?? 0));
    if (has("date")) row.getCell(idx("date")).numFmt = "dd/mm/yyyy";
    for (const k of ["date", "desc", "asset"] as Key[]) if (has(k)) row.getCell(idx(k)).alignment = { wrapText: true, vertical: "top", horizontal: "left" };
    for (const [k, fmt] of [["cost", USD], ["margin", "0.0%"], ["final", USD], ["profit", USD]] as [Key, string][]) if (has(k)) row.getCell(idx(k)).numFmt = fmt;
  });

  const last = first + counted.length - 1;
  const t = last + 1;
  const total = ws.getRow(t);
  const sumCost = counted.reduce((s, x) => s + x.r.line.costCents, 0);
  const sumFinal = counted.reduce((s, x) => s + (x.calc.finalCents ?? 0), 0);
  const label = `Total · ${counted.length} ${counted.length === 1 ? "línea" : "líneas"}`;
  if (has("desc")) total.getCell(idx("desc")).value = label;
  else if (["n", "delivery", "date", "part", "asset"].includes(COLS[0].key)) total.getCell(1).value = label;
  if (has("cost")) total.getCell(idx("cost")).value = counted.length ? { formula: `SUM(${L("cost")}${first}:${L("cost")}${last})`, result: dollars(sumCost) } : 0;
  if (has("final")) total.getCell(idx("final")).value = counted.length ? { formula: `SUM(${L("final")}${first}:${L("final")}${last})`, result: dollars(sumFinal) } : 0;
  if (has("profit")) {
    total.getCell(idx("profit")).value = has("cost") && has("final")
      ? { formula: `${L("final")}${t}-${L("cost")}${t}`, result: dollars(sumFinal - sumCost) }
      : dollars(sumFinal - sumCost);
  }
  if (has("margin")) {
    const result = sumCost > 0 ? (sumFinal - sumCost) / sumCost : 0;
    total.getCell(idx("margin")).value = has("cost") && has("profit")
      ? { formula: `IF(${L("cost")}${t}>0,${L("profit")}${t}/${L("cost")}${t},0)`, result }
      : result;
  }
  for (let c = 1; c <= COLS.length; c++) {
    const cell = total.getCell(c);
    cell.font = { bold: true };
    cell.border = { top: { style: "medium" } };
  }
  for (const k of ["cost", "final", "profit"] as Key[]) if (has(k)) total.getCell(idx(k)).numFmt = USD;
  if (has("margin")) total.getCell(idx("margin")).numFmt = "0.0%";
  // Filtros de Excel sobre el encabezado (útil en el consolidado, con muchas líneas).
  if (filter && counted.length > 0) ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: last, column: COLS.length } };

  const notes = [
    "Costo total = lo realmente pagado por lo asignado a la línea, con IVA. Margen aplicado = utilidad ÷ costo total. Utilidad generada = valor final − costo total.",
    "Activo = vehículo o maquinaria con el que se relaciona el producto de la línea (se define en el item de la bodega).",
    omitted > 0 ? `${omitted} ${omitted === 1 ? "línea omitida o sin calcular no se incluye" : "líneas omitidas o sin calcular no se incluyen"} en este reporte.` : "",
    ...extraNotes,
  ].filter(Boolean);
  notes.forEach((text, i) => {
    const r = t + 2 + i;
    if (lastLetter !== "A") ws.mergeCells(`A${r}:${lastLetter}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = text;
    c.font = { italic: true, color: { argb: "FF666666" } };
    c.alignment = { wrapText: true };
  });
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rapisys";
  wb.created = new Date();
  return wb;
}

// Reporte de cobro de UNA entrega ya revisada.
export async function buildBillingWorkbook({ contract, delivery, lines, columns = ALL_BILLING_COLUMNS }: BillingExcelInput): Promise<Buffer> {
  const wb = newWorkbook();
  addDetailSheet(
    wb,
    "Reporte de cobro",
    "Reporte de cobro — utilidad de la entrega",
    [
      ["Contrato", `${contract.name} (${contract.code})`],
      ["Cliente", contract.client],
      ["Entrega", delivery.code],
      ["Fecha de entrega", delivery.date],
      ["Lista", delivery.list],
      ["Recibe", delivery.receivedBy ?? "—"],
    ],
    lines.map((line) => ({ delivery: delivery.code, dateIso: delivery.dateIso, line })),
    columns,
    delivery.voided ? ["Esta entrega está ANULADA."] : [],
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Consolidado de TODAS las entregas (sin las anuladas): hoja «Resumen» (una fila por entrega) y hoja «Detalle» (todas las líneas).
export async function buildConsolidatedWorkbook({ contract, deliveries, columns }: ConsolidatedInput): Promise<Buffer> {
  const wb = newWorkbook();
  const sel = columns && columns.length ? columns : ALL_CONSOLIDATED_COLUMNS;

  // --- Resumen ---
  const ws = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [
    { width: 12 }, { width: 16 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 18 },
  ];
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "Reporte de cobro consolidado — todas las entregas";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = "Contrato";
  ws.getCell("A2").font = { bold: true };
  ws.mergeCells("B2:I2");
  ws.getCell("B2").value = `${contract.name} (${contract.code})`;
  ws.getCell("A3").value = "Cliente";
  ws.getCell("A3").font = { bold: true };
  ws.mergeCells("B3:I3");
  ws.getCell("B3").value = contract.client;
  const headers = ["Entrega", "Fecha de entrega", "Lista", "Líneas incluidas", "Líneas omitidas", "Costo total (c/IVA)", "Margen aplicado", "Valor final", "Utilidad generada"];
  const head = ws.getRow(6);
  headers.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    c.alignment = { horizontal: i >= 3 ? "right" : "left", vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin" } };
  });
  let sumCost = 0;
  let sumFinal = 0;
  let sumLines = 0;
  let sumOmitted = 0;
  deliveries.forEach((d, i) => {
    const calcs = d.lines.map((l) => ({ l, calc: calcOf(l) }));
    const counted = calcs.filter((x) => x.calc.counts);
    const cost = counted.reduce((s, x) => s + x.l.costCents, 0);
    const final = counted.reduce((s, x) => s + (x.calc.finalCents ?? 0), 0);
    sumCost += cost; sumFinal += final; sumLines += counted.length; sumOmitted += d.lines.length - counted.length;
    const r = 7 + i;
    const row = ws.getRow(r);
    row.getCell(1).value = d.code;
    row.getCell(2).value = new Date(`${d.dateIso}T00:00:00Z`);
    row.getCell(2).numFmt = "dd/mm/yyyy";
    row.getCell(2).alignment = { horizontal: "left" };
    row.getCell(3).value = d.list;
    row.getCell(4).value = counted.length;
    row.getCell(5).value = d.lines.length - counted.length;
    row.getCell(6).value = dollars(cost);
    row.getCell(7).value = { formula: `IF(F${r}>0,I${r}/F${r},0)`, result: cost > 0 ? (final - cost) / cost : 0 };
    row.getCell(8).value = dollars(final);
    row.getCell(9).value = { formula: `H${r}-F${r}`, result: dollars(final - cost) };
    row.getCell(6).numFmt = USD; row.getCell(7).numFmt = "0.0%"; row.getCell(8).numFmt = USD; row.getCell(9).numFmt = USD;
  });
  const lastRow = 6 + deliveries.length;
  const t = lastRow + 1;
  const total = ws.getRow(t);
  total.getCell(1).value = `Total · ${deliveries.length} ${deliveries.length === 1 ? "entrega" : "entregas"}`;
  total.getCell(4).value = deliveries.length ? { formula: `SUM(D7:D${lastRow})`, result: sumLines } : 0;
  total.getCell(5).value = deliveries.length ? { formula: `SUM(E7:E${lastRow})`, result: sumOmitted } : 0;
  total.getCell(6).value = deliveries.length ? { formula: `SUM(F7:F${lastRow})`, result: dollars(sumCost) } : 0;
  total.getCell(8).value = deliveries.length ? { formula: `SUM(H7:H${lastRow})`, result: dollars(sumFinal) } : 0;
  total.getCell(9).value = { formula: `H${t}-F${t}`, result: dollars(sumFinal - sumCost) };
  total.getCell(7).value = { formula: `IF(F${t}>0,I${t}/F${t},0)`, result: sumCost > 0 ? (sumFinal - sumCost) / sumCost : 0 };
  for (let c = 1; c <= 9; c++) { total.getCell(c).font = { bold: true }; total.getCell(c).border = { top: { style: "medium" } }; }
  total.getCell(6).numFmt = USD; total.getCell(7).numFmt = "0.0%"; total.getCell(8).numFmt = USD; total.getCell(9).numFmt = USD;
  ws.mergeCells(`A${t + 2}:I${t + 2}`);
  ws.getCell(`A${t + 2}`).value = "Solo entregas vigentes (sin anuladas). Cada entrega suma sus líneas incluidas, con los márgenes ajustados en Revisión. El detalle de líneas está en la hoja «Detalle».";
  ws.getCell(`A${t + 2}`).font = { italic: true, color: { argb: "FF666666" } };
  ws.getCell(`A${t + 2}`).alignment = { wrapText: true };

  // --- Detalle: todas las líneas de todas las entregas ---
  addDetailSheet(
    wb,
    "Detalle",
    "Reporte de cobro consolidado — detalle de líneas",
    [
      ["Contrato", `${contract.name} (${contract.code})`],
      ["Cliente", contract.client],
      ["Entregas", `${deliveries.length}`],
    ],
    deliveries.flatMap((d) => d.lines.map((line) => ({ delivery: d.code, dateIso: d.dateIso, line }))),
    sel,
    [],
    true,
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
