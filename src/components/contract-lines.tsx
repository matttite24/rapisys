"use client";

import { useRef, useState } from "react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  addLine,
  removeLine,
  setContractStatus,
  setPhase,
  setReceived,
  type LineState,
} from "@/lib/contract-actions";
import {
  PHASE_LABEL,
  PHASE_ORDER,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_ORDER,
  type Phase,
} from "@/lib/contracts";
import { formatCents, lineAmounts } from "@/lib/money";

const TH =
  "border-r px-4 py-3 text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground last:border-r-0";
const TD = "border-r px-4 py-3 align-top last:border-r-0";

export type LineView = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCents: number;
  vatRate: number;
  phase: Phase;
  received: number;
};

// Estado del contrato: un paso adelante o atrás por vez.
export function StatusControl({
  org,
  contractId,
  status,
}: {
  org: string;
  contractId: string;
  status: string;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const idx = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);
  const prev = STATUS_ORDER[idx - 1];
  const next = STATUS_ORDER[idx + 1];

  async function go(target: string) {
    setPending(true);
    setError(undefined);
    const res = await setContractStatus(org, contractId, target);
    setPending(false);
    setError(res?.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em]">
          <span aria-hidden className={`size-2 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
          {STATUS_LABEL[status] ?? status}
        </span>
        {prev && (
          <Button variant="outline" disabled={pending} onClick={() => go(prev)}>
            ← {STATUS_LABEL[prev]}
          </Button>
        )}
        {next && (
          <Button disabled={pending} onClick={() => go(next)}>
            {STATUS_LABEL[next]} →
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function LinesTable({
  org,
  contractId,
  lines,
}: {
  org: string;
  contractId: string;
  lines: LineView[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={TH}>Item</th>
            <th scope="col" className={`${TH} text-right`}>Cant.</th>
            <th scope="col" className={`${TH} text-right`}>P. unitario s/IVA</th>
            <th scope="col" className={`${TH} text-right`}>Total c/IVA</th>
            <th scope="col" className={TH}>Fase</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Quitar</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <LineRow key={l.id} org={org} contractId={contractId} line={l} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({ org, contractId, line: l }: { org: string; contractId: string; line: LineView }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [received, setReceivedValue] = useState(String(l.received));

  async function run(fn: () => Promise<LineState>) {
    setPending(true);
    setError(undefined);
    const res = await fn();
    setPending(false);
    if (res?.error) {
      setError(res.error);
      setConfirming(false);
    }
  }

  const amounts = lineAmounts(l.quantity, l.unitCents, l.vatRate);
  // Se registran recepciones mientras la línea está comprada o parcialmente recibida.
  const canReceive = l.phase === "purchased" || l.phase === "received";

  return (
    <tr className="border-b last:border-b-0">
      <td className={TD}>
        <div className="font-medium">{l.name}</div>
        {l.sku && <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>}
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </td>
      <td className={`${TD} num text-right`}>{l.quantity}</td>
      <td className={`${TD} num text-right`}>{formatCents(l.unitCents)}</td>
      <td className={`${TD} num text-right`}>{formatCents(amounts.total)}</td>
      <td className={TD}>
        <div className="flex min-w-48 flex-col gap-2">
          <NativeSelect
            aria-label={`Fase de ${l.name}`}
            className="w-full"
            value={l.phase}
            disabled={pending}
            onChange={(e) => void run(() => setPhase(org, contractId, l.id, e.target.value))}
          >
            {PHASE_ORDER.map((p) => (
              <option key={p} value={p}>
                {p === "received" ? `Recibido ${l.received} de ${l.quantity}` : PHASE_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
          {canReceive && (
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Unidades recibidas de ${l.name}`}
                inputMode="decimal"
                className="font-mono"
                value={received}
                onChange={(e) => setReceivedValue(e.target.value)}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">de {l.quantity}</span>
              <Button
                variant="outline"
                disabled={pending || received === String(l.received)}
                onClick={() => void run(() => setReceived(org, contractId, l.id, received))}
              >
                Guardar
              </Button>
            </div>
          )}
        </div>
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        {confirming ? (
          <span className="flex gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => void run(() => removeLine(org, contractId, l.id))}>
              Quitar
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-muted-foreground"
            aria-label={`Quitar ${l.name} del contrato`}
            onClick={() => setConfirming(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export type CatalogItem = { id: string; name: string; sku: string | null; suggested: string };

export function AddLineForm({
  org,
  contractId,
  vatRate,
  catalog,
}: {
  org: string;
  contractId: string;
  vatRate: number;
  catalog: CatalogItem[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<LineState>();
  const errors = state?.fields ?? {};

  if (catalog.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay items activos en el catálogo. Crea items en Bodega para agregarlos al contrato.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-4 md:grid-cols-[2fr_8rem_12rem_auto] md:items-start"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setPending(true);
        const res = await addLine(org, contractId, vatRate, undefined, data);
        setPending(false);
        setState(res);
        if (!res?.error && !res?.fields) {
          formRef.current?.reset();
          setItemId("");
          setPrice("");
        }
      }}
    >
      <FormField name="item_id" label="Item" error={errors.item_id}>
        {(a11y) => (
          <NativeSelect
            {...a11y}
            className="w-full"
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              // Precio sugerido: costo más bajo + margen del item. Se puede cambiar.
              setPrice(catalog.find((c) => c.id === e.target.value)?.suggested ?? "");
            }}
          >
            <option value="">Selecciona un item…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sku ? `${c.sku} · ` : ""}
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField name="quantity" label="Cantidad" error={errors.quantity}>
        {(a11y) => <Input {...a11y} inputMode="decimal" className="font-mono" defaultValue="1" />}
      </FormField>
      <FormField
        name="unit_price"
        label="Precio unitario s/IVA"
        error={errors.unit_price}
        hint={itemId && price ? "Sugerido por el catálogo" : undefined}
      >
        {(a11y) => (
          <Input
            {...a11y}
            inputMode="decimal"
            className="font-mono"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="md:mt-[1.35rem]">
        {pending ? "Agregando…" : "Agregar línea"}
      </Button>
      {state?.error && (
        <div className="md:col-span-4">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
