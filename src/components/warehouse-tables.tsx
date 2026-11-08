import Link from "next/link";
import { TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { ASSET_KIND_LABEL } from "@/lib/items";
import { formatCents, salePriceCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { WarehouseItem, WarehouseAsset } from "@/lib/warehouse";

export function WarehouseItemsTable({ org, rows }: { org: string; rows: WarehouseItem[] }) {
  return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className={TH}>SKU</th>
                  <th scope="col" className={TH}>Item</th>
                  <th scope="col" className={TH}>Línea / categoría</th>
                  <th scope="col" className={TH}>N.º de parte</th>
                  <th scope="col" className={`${TH} text-right`}>Existencias</th>
                  <th scope="col" className={`${TH} text-right`}>Costo s/IVA</th>
                  <th scope="col" className={`${TH} text-right`}>Margen</th>
                  <th scope="col" className={`${TH} text-right`}>Venta s/IVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cost = r.costCents ?? undefined;
                  const cat = r.category;
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                      <td className={`${TD} num`}>{r.sku ?? "—"}</td>
                      <td className={`${TD} p-0`}>
                        <Link
                          href={`/${org}/bodega/${r.id}`}
                          className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                        >
                          {r.name}
                          {!r.is_active && (
                            <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">inactivo</span>
                          )}
                        </Link>
                      </td>
                      <td className={TD}>{[r.line, cat].filter(Boolean).join(" / ") || "—"}</td>
                      <td className={`${TD} num`}>
                        {r.part_numbers[0] ?? "—"}
                        {r.part_numbers.length > 1 && (
                          <span className="ml-1 text-muted-foreground">+{r.part_numbers.length - 1}</span>
                        )}
                      </td>
                      <td className={cn(TD, "num text-right", !r.stock && "text-muted-foreground")}>
                        {r.stock}
                      </td>
                      <td className={`${TD} num text-right`}>{cost !== undefined ? formatCents(cost) : "—"}</td>
                      <td className={`${TD} num text-right`}>{Number(r.margin_percent)}%</td>
                      <td className={`${TD} num text-right`}>
                        {cost !== undefined ? formatCents(salePriceCents(cost, Number(r.margin_percent))) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  );
}
export function WarehouseAssetsTable({ org, rows }: { org: string; rows: WarehouseAsset[] }) {
  return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className={TH}>Tipo</th>
                <th scope="col" className={TH}>Nombre</th>
                <th scope="col" className={TH}>Marca / modelo</th>
                <th scope="col" className={`${TH} text-right`}>Año</th>
                <th scope="col" className={TH}>Placa / código</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <td className={TD}>{ASSET_KIND_LABEL[r.kind]}</td>
                  <td className={`${TD} p-0`}>
                    <Link
                      href={`/${org}/bodega/activos/${r.id}`}
                      className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={TD}>{[r.brand, r.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className={`${TD} num text-right`}>{r.year ?? "—"}</td>
                  <td className={`${TD} num`}>{r.plate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );
}
