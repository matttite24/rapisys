"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListInfo, ListTabs, type ListView } from "@/components/contract-lists";
import { LineSearch } from "@/components/line-search";
import { PageSection, TABLE_TD, TABLE_TH } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { DeliveryActions } from "@/components/delivery-sheet";
import { SupplyPanel } from "@/components/supply-panel";
import { Progress, STATE, type SupplyState } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Search01Icon } from "@hugeicons/core-free-icons";

export type SupplyLine = {
  id: string;
  listId: string;
  n: number;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  cpc: string;
  reserved: number;
  purchased: number;
  delivered: number;
  costCents: number | null;
  state: SupplyState;
};

const TH = cn(TABLE_TH, "font-bold text-foreground");
const TD = cn(TABLE_TD, "py-2 align-middle");

const STATE_ORDER: SupplyState[] = ["pending", "partial", "purchased", "in_stock", "delivered"];

export type { SupplyState };

export function SupplyBoard({
  org,
  contractId,
  lists,
  lines,
  counts,
  activeId,
  page,
  total,
  q,
  estado,
  basePath,
  canAct,
  deliveries,
}: {
  org: string;
  contractId: string;
  lists: ListView[];
  lines: SupplyLine[];
  counts: Record<SupplyState, number>;
  activeId: string | null;
  page: number;
  total: number;
  q: string;
  estado: SupplyState | "";
  basePath: string;
  canAct: boolean;
  // Entregas ya registradas en el contrato.
  deliveries: number;
}) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  // La lista elegida se marca al instante; las líneas llegan cuando responde el servidor.
  const [shownActiveId, setShownActiveId] = useOptimistic(activeId);
  const active = lists.find((l) => l.id === shownActiveId) ?? lists[0] ?? null;
  const loaded = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const switching = active?.id !== loaded?.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = lines.find((l) => l.id === selectedId) ?? null;

  function go(next: { lista?: string; q?: string; estado?: string; page?: number }) {
    const sp = new URLSearchParams();
    sp.set("lista", next.lista ?? loaded?.id ?? "");
    const nq = next.q ?? q;
    const ne = next.estado ?? estado;
    if (nq) sp.set("q", nq);
    if (ne) sp.set("estado", ne);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    startNav(() => {
      if (next.lista) setShownActiveId(next.lista);
      router.push(`${basePath}?${sp}`, { scroll: false });
    });
  }

  if (lists.length === 0) {
    return (
      <PageSection label="Sin listas">
        <p className="max-w-xl text-muted-foreground">
          Este contrato aún no tiene listas de referencia. Crea una en <strong className="text-foreground">Items</strong>{" "}
          para empezar a abastecer.
        </p>
      </PageSection>
    );
  }

  const listCounts: Record<string, number> = {};
  for (const l of lists) listCounts[l.id] = l.count;
  const totalLines = counts.pending + counts.partial + counts.purchased + counts.in_stock + counts.delivered;

  return (
    <>
      <ListTabs
        lists={lists}
        counts={listCounts}
        activeId={active?.id ?? null}
        canAdd={false}
        onSelect={(id) => go({ lista: id, q: "", estado: "" })}
        onNew={() => {}}
      />
      {loaded && (
        <ListInfo
          key={loaded.id}
          org={org}
          contractId={contractId}
          list={loaded}
          lineCount={loaded.count}
          canEdit={false}
          editing={false}
          onEdit={() => {}}
        />
      )}

      {/* Resumen por estado: cada celda filtra la tabla. */}
      <div className="grid grid-cols-2 gap-px border-b bg-border md:grid-cols-5 [&>*]:bg-background">
        {STATE_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={estado === s}
            onClick={() => go({ estado: estado === s ? "" : s })}
            className={cn(
              "flex flex-col items-start gap-1 px-6 py-3 text-left transition-colors hover:bg-accent",
              estado === s && "bg-foreground/[0.06] shadow-[inset_0_-2px_0_var(--brand)]",
            )}
          >
            <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
              <span aria-hidden className={cn("size-2", STATE[s].dot)} />
              {STATE[s].label}
            </span>
            <span className="num text-2xl">{counts[s]}</span>
          </button>
        ))}
      </div>

      <section className="border-b">
        <div className="flex h-12 items-stretch border-b">
          <LineSearch key={`${loaded?.id}:${q}`} q={q} onSearch={(next) => go({ q: next })} />
          {loaded && (
            <DeliveryActions
              org={org}
              contractId={contractId}
              listId={loaded.id}
              listName={loaded.name}
              canAct={canAct}
              deliveries={deliveries}
            />
          )}
        </div>

        {navigating || switching ? (
          <SupplyTableSkeleton rows={Math.min(8, Math.max(3, active?.count ?? 5))} />
        ) : (
          <div>
            {lines.length === 0 ? (
              <p className="p-6 text-muted-foreground">
                {q || estado ? "Ninguna línea coincide con el filtro." : "Esta lista no tiene líneas."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
                      <th scope="col" className={TH}>Part. num.</th>
                      <th scope="col" className={TH}>Descripción</th>
                      <th scope="col" className={`${TH} text-right`}>Cantidad</th>
                      <th scope="col" className={TH}>Avance</th>
                      <th scope="col" className={TH}>Estado</th>
                      <th scope="col" className={`${TH} text-right`}>Costo unit.</th>
                      <th scope="col" className={`${TH} w-px`}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className={cn("border-b last:border-b-0", selectedId === l.id && "bg-muted")}>
                        <td className={`${TD} num text-right text-muted-foreground`}>{l.n}</td>
                        <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{l.partNumber || "—"}</td>
                        <td className={`${TD} break-words`}>{l.description}</td>
                        <td className={`${TD} num whitespace-nowrap text-right`}>
                          {l.quantity} <span className="font-sans text-xs text-muted-foreground">{unitLabel(l.unit)}</span>
                        </td>
                        <td className={TD}><Progress stock={l.reserved} purchased={l.purchased} delivered={l.delivered} total={l.quantity} /></td>
                        <td className={`${TD} whitespace-nowrap`}>
                          <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.06em]">
                            <span aria-hidden className={cn("size-2", STATE[l.state].dot)} />
                            {STATE[l.state].label}
                          </span>
                        </td>
                        <td className={`${TD} num text-right`}>{l.costCents === null ? "—" : formatCents(l.costCents)}</td>
                        <td className={cn(TD, "p-1")}>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setSelectedId(l.id)}>
                            {canAct ? "Abastecer" : "Ver"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager
              basePath={basePath}
              page={page}
              total={total}
              size={LINES_PAGE_SIZE}
              params={{ lista: loaded?.id ?? "", ...(q ? { q } : {}), ...(estado ? { estado } : {}) }}
            />
            <p className="border-t px-6 py-3 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {q || estado ? `${total} de ${totalLines} líneas` : `${totalLines} ${totalLines === 1 ? "línea" : "líneas"}`}
            </p>
          </div>
        )}
      </section>

      <SupplyPanel
        org={org}
        contractId={contractId}
        line={selected}
        canAct={canAct}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

const WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

function SupplyTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando líneas" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
            <th scope="col" className={TH}>Part. num.</th>
            <th scope="col" className={TH}>Descripción</th>
            <th scope="col" className={`${TH} text-right`}>Cantidad</th>
            <th scope="col" className={TH}>Avance</th>
            <th scope="col" className={TH}>Estado</th>
            <th scope="col" className={`${TH} text-right`}>Costo unit.</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className={`${TD} w-px`}><Skeleton className="ml-auto h-4 w-5" /></td>
              <td className={TD}><Skeleton className={cn("h-4", WIDTHS[i % 6])} /></td>
              <td className={cn(TD, "w-1/3")}><Skeleton className={cn("h-4", WIDTHS[(i + 2) % 6])} /></td>
              <td className={TD}><Skeleton className="ml-auto h-4 w-10" /></td>
              <td className={TD}><Skeleton className="h-2 w-24" /></td>
              <td className={TD}><Skeleton className="h-4 w-28" /></td>
              <td className={TD}><Skeleton className="ml-auto h-4 w-14" /></td>
              <td className={cn(TD, "p-1")}><Skeleton className="h-8 w-20" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Estructura de la pantalla mientras llegan los datos.
export function SupplySkeleton() {
  return (
    <div role="status" aria-label="Cargando abastecimiento">
      <div className="flex h-12 items-center gap-6 border-b px-6">
        <Skeleton className="size-5" />
        {[36, 28, 32].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px border-b bg-border md:grid-cols-5 [&>*]:bg-background">
        {STATE_ORDER.map((s) => (
          <div key={s} className="flex flex-col gap-2 px-6 py-3">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
              {STATE[s].label}
            </span>
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="flex h-12 items-center gap-3 border-b px-6">
        <HugeiconsIcon icon={Search01Icon} aria-hidden className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Buscar por número de parte o descripción</span>
      </div>
      <SupplyTableSkeleton />
    </div>
  );
}
