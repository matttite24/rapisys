"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import Link from "next/link";
import { PageFooterActions } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { SearchInput } from "@/components/search-input";
import { SearchBar } from "@/components/url-search";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatIso } from "@/lib/dates";

export type DeliveryListRow = {
  id: string; number: number; delivered_on: string; received_by: string | null;
  listName: string; lines: number; units: number; voided?: boolean;
};
const deliveryCode = (n: number) => `ENT-${String(n).padStart(3, "0")}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function DeliveryList({ org, contractId: id, rows }: { org: string; contractId: string; rows: DeliveryListRow[] }) {
  const [query, setQuery] = useState("");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const deliveries = rows.filter((row) => {
    const text = normalize([deliveryCode(row.number), row.voided ? "anulada" : "entregada", row.number, row.delivered_on, formatIso(row.delivered_on), row.listName, row.received_by].join(" "));
    return words.every((word) => text.includes(word));
  });
  return (
    <PageSection className="p-0">
      <PageFooterActions>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          <span className="num">{query.trim() ? `${deliveries.length} de ${rows.length}` : rows.length}</span> {rows.length === 1 ? "entrega" : "entregas"}
        </span>
      </PageFooterActions>
      <SearchBar>
        <SearchInput label="Buscar entregas" placeholder="Buscar por entrega, estado, fecha, lista o quién recibe" value={query} onChange={setQuery} />
      </SearchBar>
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-xl text-muted-foreground">
            Aún no hay entregas. Se generan desde Abastecimiento, con las líneas que ya tienen stock.
          </p>
          <Link href={`/${org}/contratos/${id}/abastecimiento`} className={buttonVariants({ variant: "outline" })}>
            Ir a Abastecimiento
          </Link>
        </div>
      ) : deliveries.length === 0 ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">Ninguna entrega coincide con la búsqueda.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-transparent">
                <TableHead>Entrega</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Lista</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead>Recibe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id} className={`border-b last:border-b-0 hover:bg-accent/60 ${d.voided ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}>
                  <TableCell className="p-0">
                    <Link
                      href={`/${org}/contratos/${id}/entregas/${d.id}`}
                      className="block px-4 py-3 font-mono font-medium underline-offset-4 hover:underline"
                    >
                      {deliveryCode(d.number)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.voided ? "destructive" : "solid-stock"}>{d.voided ? "Anulada" : "Entregada"}</Badge>
                  </TableCell>
                  <TableCell className="num whitespace-nowrap">{formatIso(d.delivered_on)}</TableCell>
                  <TableCell>{d.listName}</TableCell>
                  <TableCell className="num text-right">{d.lines}</TableCell>
                  <TableCell className="num text-right">{d.units}</TableCell>
                  <TableCell>{d.received_by ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageSection>
  );
}
