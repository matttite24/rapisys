import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_KIND_LABEL } from "@/lib/items";
import { formatCents, salePriceCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { WarehouseItem, WarehouseAsset } from "@/lib/warehouse";

export function WarehouseItemsTable({ org, rows }: { org: string; rows: WarehouseItem[] }) {
  return (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-transparent">
                  <TableHead>SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Línea / categoría</TableHead>
                  <TableHead>N.º de parte</TableHead>
                  <TableHead className="text-right">Existencias</TableHead>
                  <TableHead className="text-right">Costo s/IVA</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">Venta s/IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const cost = r.costCents ?? undefined;
                  const cat = r.category;
                  return (
                    <TableRow key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                      <TableCell className="num">{r.sku ?? "—"}</TableCell>
                      <TableCell className="p-0">
                        <Link
                          href={`/${org}/bodega/${r.id}`}
                          className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                        >
                          {r.name}
                          {!r.is_active && (
                            <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">inactivo</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>{[r.line, cat].filter(Boolean).join(" / ") || "—"}</TableCell>
                      <TableCell className="num">
                        {r.part_numbers[0] ?? "—"}
                        {r.part_numbers.length > 1 && (
                          <span className="ml-1 text-muted-foreground">+{r.part_numbers.length - 1}</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("num text-right", !r.stock && "text-muted-foreground")}>
                        {r.stock}
                      </TableCell>
                      <TableCell className="num text-right">{cost !== undefined ? formatCents(cost) : "—"}</TableCell>
                      <TableCell className="num text-right">{Number(r.margin_percent)}%</TableCell>
                      <TableCell className="num text-right">
                        {cost !== undefined ? formatCents(salePriceCents(cost, Number(r.margin_percent))) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
  );
}
export function WarehouseAssetsTable({ org, rows }: { org: string; rows: WarehouseAsset[] }) {
  return (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-transparent">
                <TableHead>Tipo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Marca / modelo</TableHead>
                <TableHead className="text-right">Año</TableHead>
                <TableHead>Placa / código</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                  <TableCell>{ASSET_KIND_LABEL[r.kind]}</TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/${org}/bodega/activos/${r.id}`}
                      className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>{[r.brand, r.model].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell className="num text-right">{r.year ?? "—"}</TableCell>
                  <TableCell className="num">{r.plate ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
  );
}
