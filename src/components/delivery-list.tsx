"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFooterActions } from "@/components/page-shortcuts";
import { PageSection, TABLE_TD as TD, TABLE_TH as TH } from "@/components/page-section";
import { SearchInput } from "@/components/search-input";
import { SearchBar } from "@/components/url-search";
import { buttonVariants } from "@/components/ui/button";
import { formatIso } from "@/lib/dates";

export type DeliveryListRow = {
  id: string; number: number; delivered_on: string; received_by: string | null;
  listName: string; lines: number; units: number;
};
const deliveryCode = (n: number) => `ENT-${String(n).padStart(3, "0")}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function DeliveryList({ org, contractId: id, rows }: { org: string; contractId: string; rows: DeliveryListRow[] }) {
  const [query, setQuery] = useState("");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const deliveries = rows.filter((row) => {
    const text = normalize([deliveryCode(row.number), row.number, row.delivered_on, formatIso(row.delivered_on), row.listName, row.received_by].join(" "));
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
        <SearchInput label="Buscar entregas" placeholder="Buscar por entrega, fecha, lista o quién recibe" value={query} onChange={setQuery} />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Entrega</th>
                <th scope="col" className={TH}>Fecha</th>
                <th scope="col" className={TH}>Lista</th>
                <th scope="col" className={`${TH} text-right`}>Líneas</th>
                <th scope="col" className={`${TH} text-right`}>Unidades</th>
                <th scope="col" className={TH}>Recibe</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/contratos/${id}/entregas/${d.id}`}
                      className="block px-4 py-3 font-mono font-medium underline-offset-4 hover:underline"
                    >
                      {deliveryCode(d.number)}
                    </Link>
                  </td>
                  <td className={`${TD} num whitespace-nowrap`}>{formatIso(d.delivered_on)}</td>
                  <td className={TD}>{d.listName}</td>
                  <td className={`${TD} num text-right`}>{d.lines}</td>
                  <td className={`${TD} num text-right`}>{d.units}</td>
                  <td className={TD}>{d.received_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}
