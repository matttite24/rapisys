"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseDecimal } from "@/lib/money";
import { assignPurchase, listContractInvoices, type ContractInvoice } from "@/lib/purchase-actions";
import {
  applyMatches,
  getInvoiceLines,
  proposeMatches,
  undoMatches,
  type InvoiceLine,
  type Proposal,
} from "@/lib/reconcile-actions";
import { getStockSummary, reserveStock, searchStock, type StockResult } from "@/lib/supply-actions";
import { useDebouncedSearch } from "@/lib/use-debounced-search";

// Qué muestra el panel: lo ya asignado a la línea, las líneas de una factura o los productos con existencias en la bodega.
export type Source = "asignados" | "cotizaciones" | "facturas" | "bodega";
// Cómo se cubre: «bodega» asigna unidades que ya están en la bodega; «llegar» reserva lo que aún viene en una factura.
export type How = "bodega" | "llegar";

// Lo que está elegido en la lista de la derecha (línea de factura o producto de la bodega), listo para asignar.
export type Current = {
  label: string;
  codes: string[]; // números de parte para cruzar con las líneas del contrato
  lots: { id: string; remaining: number }[]; // unidades en la bodega, el lote más barato primero
  inStock: number;
  purchaseLineId?: string; // solo en líneas de factura
  available: number; // por llegar y sin reservar (solo en líneas de factura)
};

// Estado del panel «Abastecimiento»: qué se eligió en la lista de la derecha y a qué línea de la tabla de la
// izquierda se asigna. Lo comparten el panel y la tabla de líneas del contrato.
export function useReconcile(org: string, contractId: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSourceState] = useState<Source>("asignados");
  const [invoices, setInvoices] = useState<ContractInvoice[] | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceLinesError, setInvoiceLinesError] = useState("");
  const invoicesRequest = useRef<Promise<void> | null>(null);
  const invoiceRequest = useRef(0);
  const selectedInvoice = useRef("");
  const [lines, setLines] = useState<InvoiceLine[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [stockQ, setStockQ] = useState("");
  const [stockPickedId, setStockPickedId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  // Cuántos productos y unidades hay en la bodega (se pide al entrar a la pestaña y tras asignar).
  const [stockSummary, setStockSummary] = useState<{ products: number; units: number } | null>(null);
  // Sube cada vez que algo cambia, para que lo ya cubierto de la línea enfocada se vuelva a pedir.
  const [version, setVersion] = useState(0);
  const [stockSummaryError, setStockSummaryError] = useState("");
  const summaryRequest = useRef<Promise<void> | null>(null);
  const stock = useDebouncedSearch((text: string) => searchStock(org, text));
  // Revisión de «cubrir las que coinciden»: propuestas por número de parte; se pueden desmarcar antes de confirmar.
  const [review, setReview] = useState<{ proposals: Proposal[]; unmatched: number; skipped: Set<string> } | null>(null);
  const [proposing, setProposing] = useState(false);

  const picked = lines?.find((l) => l.id === pickedId) ?? null;
  const stockRows = stock.loading || stock.error ? null : (stock.results?.rows ?? null);
  const stockPicked = stockRows?.find((r) => r.id === stockPickedId) ?? null;

  const current: Current | null =
    source === "facturas"
      ? picked && {
          label: picked.code || picked.name,
          codes: [picked.code, picked.sku ?? "", ...picked.partNumbers].filter(Boolean),
          lots: picked.lots,
          inStock: picked.inStock,
          purchaseLineId: picked.id,
          available: picked.available,
        }
      : source === "bodega" && stockPicked ? {
          label: stockPicked.sku || stockPicked.partNumbers[0] || stockPicked.name,
          codes: [stockPicked.sku ?? "", ...stockPicked.partNumbers].filter(Boolean),
          lots: stockPicked.lots.map((l) => ({ id: l.id, remaining: l.remaining })),
          inStock: stockPicked.onHand,
          available: 0,
        } : null;

  // Abre el panel para una línea de la tabla: lo primero que se ve es lo que ya tiene asignado.
  function show() {
    setOpen(true);
    setSourceState("asignados");
    setReview(null);
  }

  function hide() {
    setOpen(false);
    unpick();
  }

  function unpick() {
    setPickedId(null);
    setStockPickedId(null);
    setQty("");
  }

  function setSource(next: Source) {
    setSourceState(next);
    setReview(null);
    unpick();
    if (next === "facturas") void loadInvoices();
    if (next === "bodega") void loadStockSummary();
  }

  function pick(line: InvoiceLine | null) {
    setPickedId(line?.id ?? null);
    setQty("");
  }

  function pickStock(row: StockResult | null) {
    setStockPickedId(row?.id ?? null);
    setQty("");
  }

  function searchStockText(value: string) {
    setStockQ(value);
    setStockPickedId(null);
    if (value.trim()) stock.run(value);
    else stock.clear();
  }

  function loadInvoices(force = false): Promise<void> {
    if (invoicesRequest.current) return invoicesRequest.current;
    if (invoices !== null && !force) return Promise.resolve();
    setInvoiceError("");
    const request = listContractInvoices(contractId).then(setInvoices).catch(() => {
      setInvoiceError("No se pudieron cargar las facturas.");
    }).finally(() => { invoicesRequest.current = null; });
    invoicesRequest.current = request;
    return request;
  }

  function loadStockSummary(force = false): Promise<void> {
    if (summaryRequest.current) return summaryRequest.current;
    if (stockSummary !== null && !force) return Promise.resolve();
    setStockSummaryError("");
    const request = getStockSummary(org).then((summary) => {
      if (!summary) throw new Error("unavailable");
      setStockSummary(summary);
    }).catch(() => { setStockSummaryError("No se pudo cargar el resumen de bodega."); })
      .finally(() => { summaryRequest.current = null; });
    summaryRequest.current = request;
    return request;
  }

  async function loadInvoiceLines(id: string) {
    if (id !== selectedInvoice.current) return;
    const request = ++invoiceRequest.current;
    setInvoiceLinesError("");
    setLines(null);
    try {
      const rows = await getInvoiceLines(org, contractId, id);
      if (request === invoiceRequest.current) setLines(rows);
    } catch {
      if (request === invoiceRequest.current) setInvoiceLinesError("No se pudieron cargar los productos de la factura.");
    }
  }

  async function chooseInvoice(id: string) {
    selectedInvoice.current = id;
    invoiceRequest.current++;
    setInvoiceId(id);
    setInvoiceLinesError("");
    setReview(null);
    unpick();
    setLines(null);
    if (id) await loadInvoiceLines(id);
  }

  // Refresca recursos independientes en paralelo; una respuesta vieja no reemplaza la factura actual.
  async function refresh() {
    setVersion((v) => v + 1);
    router.refresh();
    if (stockQ.trim()) stock.run(stockQ, 0);
    await Promise.all([
      selectedInvoice.current ? loadInvoiceLines(selectedInvoice.current) : Promise.resolve(),
      invoices !== null ? loadInvoices(true) : Promise.resolve(),
      stockSummary !== null ? loadStockSummary(true) : Promise.resolve(),
    ]);
  }

  // Asigna lo elegido a una línea del contrato. Sin cantidad escrita toma lo que falte o lo que haya, el menor.
  // «bodega» usa unidades que ya están en la bodega (lote más barato primero); «llegar» reserva lo que viene en la
  // factura. Si algo falla a medias se deshace lo ya hecho.
  async function assignImpl(target: { id: string; open: number }, how?: How) {
    if (!current || busy) return;
    const h: How = how ?? (current.inStock > 0 ? "bodega" : "llegar");
    const room = h === "bodega" ? current.inStock : current.available;
    const asked = qty.trim() ? parseDecimal(qty) : null;
    const n = asked ?? Math.min(room, target.open);
    if (!n || n <= 0) {
      toast.error(room <= 0 ? "No quedan unidades por cubrir de esta forma." : "Escribe una cantidad válida, con máximo 2 decimales.");
      return;
    }
    if (n > room) {
      toast.error(`Solo quedan ${room} ${h === "bodega" ? "en la bodega" : "por llegar"}.`);
      return;
    }
    setBusy(true);
    const ids: string[] = [];
    const fail = async (message: string) => {
      if (ids.length) await undoMatches(org, contractId, ids);
      toast.error(message);
      setBusy(false);
    };
    if (h === "bodega") {
      let left = n;
      for (const lot of current.lots) {
        if (left <= 0) break;
        const take = Math.min(left, lot.remaining);
        const r = await reserveStock(org, contractId, target.id, lot.id, String(take));
        if (r?.error || !r?.id) return fail(r?.error ?? "No se pudo asignar.");
        ids.push(r.id);
        left -= take;
      }
    } else {
      const r = await assignPurchase(org, contractId, current.purchaseLineId!, target.id, String(n));
      if (r?.error || !r?.id) return fail(r?.error ?? "No se pudo reservar.");
      ids.push(r.id);
    }
    toast.success(`${h === "bodega" ? "Asignadas" : "Reservadas"} ${n} · ${current.label}`, {
      action: {
        label: "Deshacer",
        onClick: async () => {
          const undone = await undoMatches(org, contractId, ids);
          if (undone?.error) return void toast.error(undone.error);
          await refresh();
        },
      },
    });
    setQty("");

    // La línea del contrato queda servida: se suelta lo elegido y se vuelve a pedir lo que muestra el panel.
    unpick();
    await refresh();
    setBusy(false);
  }

  async function propose() {
    if (!invoiceId || proposing) return;
    const request = invoiceRequest.current;
    setProposing(true);
    unpick();
    try {
      const r = await proposeMatches(org, contractId, invoiceId);
      if (request !== invoiceRequest.current) return;
      if (!r.proposals.length) {
        toast.info("Ninguna línea de la factura coincide por número de parte con una línea pendiente del contrato.");
        return;
      }
      setReview({ proposals: r.proposals, unmatched: r.unmatched, skipped: new Set() });
    } catch {
      if (request === invoiceRequest.current) toast.error("No se pudieron buscar coincidencias. Inténtalo de nuevo.");
    } finally { setProposing(false); }
  }

  function toggleProposal(key: string) {
    setReview((r) => {
      if (!r) return r;
      const skipped = new Set(r.skipped);
      if (!skipped.delete(key)) skipped.add(key);
      return { ...r, skipped };
    });
  }

  // Cubre de una vez todo lo que quedó marcado; si algo falla no se cubre nada.
  async function applyReviewImpl() {
    if (!review || busy) return;
    const chosen = review.proposals.filter((p) => !review.skipped.has(p.key));
    if (!chosen.length) return;
    setBusy(true);
    const res = await applyMatches(
      org,
      contractId,
      chosen.map((p) => ({ purchaseLineId: p.purchaseLineId, targetId: p.targetId, qty: p.qty, lotId: p.lotId })),
    );
    if (res.error || !res.ids) {
      toast.error(res.error ?? "No se pudo asignar.");
      setBusy(false);
      return;
    }
    const ids = res.ids;
    toast.success(`Cubiertas ${chosen.length} ${chosen.length === 1 ? "línea" : "líneas"}`, {
      action: {
        label: "Deshacer",
        onClick: async () => {
          const undone = await undoMatches(org, contractId, ids);
          if (undone.error) return void toast.error(undone.error);
          await refresh();
        },
      },
    });
    setReview(null);
    await refresh();
    setBusy(false);
  }

  // Si una petición falla (red, servidor), el panel no queda bloqueado en "ocupado". No actúan si ya hay una en curso.
  async function assign(target: { id: string; open: number }, how?: How) {
    if (busy) return;
    try {
      await assignImpl(target, how);
    } finally {
      setBusy(false);
    }
  }
  async function applyReview() {
    if (busy) return;
    try {
      await applyReviewImpl();
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    show,
    hide,
    source,
    setSource,
    invoices,
    invoiceError,
    invoiceLinesError,
    loadInvoices,
    invoiceId,
    chooseInvoice,
    lines,
    picked,
    pick,
    stockQ,
    searchStockText,
    stockRows,
    stockMore: stock.results?.more ?? false,
    stockLoading: stock.loading,
    stockError: stock.error,
    stockSummaryError,
    loadStockSummary,
    stockSummary,
    stockPicked,
    pickStock,
    current,
    unpick,
    qty,
    setQty,
    busy,
    assign,
    review,
    proposing,
    propose,
    toggleProposal,
    applyReview,
    cancelReview: () => setReview(null),
    version,
    refresh,
  };
}

export type Reconcile = ReturnType<typeof useReconcile>;
