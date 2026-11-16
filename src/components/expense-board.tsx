"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Add01Icon, Edit02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { useExpenseCategory } from "@/components/use-expense-category";
import { EmptyState } from "@/components/empty-state";
import { HeaderAction } from "@/components/header-action";
import { PageFigures, PageFooterActions } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { SearchBar, UrlSearch } from "@/components/url-search";
import { TAB, TABS_ROW } from "@/components/count-tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Pager } from "@/components/pager";
import { PageLoading } from "@/components/page-loading";
import { ConfirmTap } from "@/components/confirm-tap";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttachFiles } from "@/components/attach-files";
import { ExpenseForm } from "@/components/expense-form";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, EXPENSE_PAGE_SIZE, type Expense } from "@/lib/expenses";
import { deleteExpense } from "@/lib/expense-actions";
import { formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";

const HEADINGS = ["Fecha", "Detalle de gastos", "Categorías", "Pago / comprobante", "Total", ""];

export function ExpenseBoard({ org, contractId, rows: serverRows, count: serverCount, totalCents: serverTotal, allCount: serverAllCount, allTotalCents: serverAllTotal, q, category: serverCategory, page: serverPage, fileCounts = {} }: {
  org: string; contractId: string; rows: Expense[]; count: number; totalCents: number; allCount: number; allTotalCents: number;
  q: string; category: string; page: number; fileCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);
  const initial = useMemo(() => ({ rows: serverRows, count: serverCount, totalCents: serverTotal, allCount: serverAllCount, allTotalCents: serverAllTotal, category: serverCategory, page: serverPage }),
    [serverRows, serverCount, serverTotal, serverAllCount, serverAllTotal, serverCategory, serverPage]);
  const categoryView = useExpenseCategory(org, contractId, q, initial);
  const { rows, count, totalCents, allCount, allTotalCents, category, page, loading: pending } = categoryView;
  const openNew = useCallback(() => setEditing(null), []);
  const close = useCallback(() => setEditing(undefined), []);
  const basePath = `/${org}/contratos/${contractId}/gastos`;
  const filtered = !!(q || category);
  const params = { ...(q ? { q } : {}), ...(category ? { categoria: category } : {}) };
  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      const result = await deleteExpense(org, contractId, id);
      if (!result.ok) toast.error(result.error ?? "No se pudo eliminar el gasto.");
      else { toast.success("Gasto eliminado."); router.refresh(); }
    } catch { toast.error("No se pudo eliminar el gasto. Inténtalo de nuevo."); }
    finally { setDeleting(null); }
  }
  return (
    <PageSection className="p-0">
      <HeaderAction icon={Add01Icon} label="Registrar gasto" onClick={openNew} />
      <PageFigures figures={[{ label: "Gastos del proceso", value: formatCents(allTotalCents) }, ...(filtered ? [{ label: "Total de documentos mostrados", value: pending || categoryView.error ? "—" : formatCents(totalCents) }] : [])]} />
      <PageFooterActions><span className="whitespace-nowrap text-sm text-muted-foreground"><span className="num">{pending ? "…" : categoryView.error ? "—" : filtered ? `${count} de ${allCount}` : allCount}</span> {allCount === 1 ? "documento" : "documentos"}</span></PageFooterActions>
      <SearchBar>
        <UrlSearch q={q} label="Buscar gastos" placeholder="Buscar por concepto, beneficiario o comprobante" />
      </SearchBar>
      <div role="group" aria-label="Filtrar por categoría" className={TABS_ROW}>
        {[["", "Todas"], ...Object.entries(EXPENSE_CATEGORIES)].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={category === key} className={TAB(category === key)} onClick={() => {
            const selected = category === key ? "" : key;
            void categoryView.select(selected);
          }}>{label}</button>
        ))}
      </div>
      {pending ? <PageLoading /> : categoryView.error ? (
        <div role="alert" className="space-y-3 p-6"><p className="text-sm text-destructive">{categoryView.error}</p><Button variant="outline" onClick={() => void categoryView.retry()}>Reintentar</Button></div>
      ) : allCount === 0 ? (
        <EmptyState image="image-Y9XTBPYYZden371yTkDUk5RakCVmX9" fill action={<Button onClick={openNew}>Registrar primer gasto</Button>}>
          Este proceso aún no tiene gastos registrados.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState image="image-Y9XTBPYYZden371yTkDUk5RakCVmX9" fill>
          <span role="status">Ningún gasto coincide con la búsqueda.</span>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              {HEADINGS.map((label, i) => (
                <TableHead key={label || "actions"} className={i === 4 ? "text-right" : undefined}>
                  {label || <span className="sr-only">Acciones</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-accent/40">
                <TableCell className="whitespace-nowrap">{formatIso(row.spent_on)}</TableCell>
                <TableCell className="min-w-56">
                  <ul className="space-y-1">
                    {row.lines.map((line, index) => (
                      <li key={line.id ?? index} className="flex justify-between gap-4">
                        <span>{line.concept}</span>
                        <span className="num shrink-0 text-xs text-muted-foreground">{formatCents(line.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                  {row.payee && <p className="text-xs text-muted-foreground">{row.payee}</p>}
                  {row.notes && <p className="max-w-md whitespace-pre-wrap text-xs text-muted-foreground">{row.notes}</p>}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {[...new Set(row.lines.map((line) => EXPENSE_CATEGORIES[line.category]))].join(" · ")}
                </TableCell>
                <TableCell>
                  <p>{PAYMENT_METHODS[row.payment_method]}</p>
                  {row.document_ref && <p className="font-mono text-xs text-muted-foreground">{row.document_ref}</p>}
                  {/^https?:\/\//.test(row.document_url) && (
                    <a href={row.document_url} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4">
                      Ver comprobante ↗
                    </a>
                  )}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right font-medium">{formatCents(row.amount_cents)}</TableCell>
                <TableCell className="w-px">
                  <div className="flex items-center gap-1">
                    <AttachFiles iconOnly org={org} contractId={contractId} source="expense" sourceId={row.id} label={row.lines[0]?.concept ?? "Gasto"} count={fileCounts[row.id] ?? 0} />
                    <Button variant="ghost" size="icon" aria-label={`Editar gasto: ${row.concept}`} onClick={() => setEditing(row)}>
                      <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                    </Button>
                    <ConfirmTap
                      variant="ghost"
                      size="icon"
                      disabled={!!deleting}
                      aria-label={`Eliminar gasto: ${row.concept}`}
                      hint="Toca otra vez: se elimina el documento y todas sus líneas"
                      onConfirm={() => void remove(row.id)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </ConfirmTap>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!pending && !categoryView.error && <Pager basePath={basePath} page={page} total={count} size={EXPENSE_PAGE_SIZE} params={params} />}
      <Sheet open={editing !== undefined} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl gap-0">
          {editing !== undefined && <ExpenseForm key={editing?.id ?? "new"} org={org} contractId={contractId} expense={editing ?? undefined} onClose={close} />}
        </SheetContent>
      </Sheet>
    </PageSection>
  );
}
