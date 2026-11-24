import { StatusChip } from "@/components/status-chip";

// El proceso abierto en la columna de opciones, en dos partes: tipo y monto en la fila del encabezado (misma altura
// que el de contenido, para que su línea siga recta) y, debajo, la tarjeta de ancho completo con el resto de los datos.
export function ProcessHead({ kind, total }: { kind?: string; total: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col justify-center pr-4 pl-5">
      <p className="truncate caps text-[0.6875rem] text-muted-foreground">{kind === "credit" ? "Proceso a crédito" : "Proceso a contrato"}</p>
      <p className="truncate text-base leading-tight font-semibold tabular-nums">{total}</p>
    </div>
  );
}

export function ProcessCard({
  code,
  name,
  client,
  status,
  kind,
  deliveries,
  delivery,
  daysLeft,
}: {
  code: string;
  name: string;
  client?: string | null;
  status: string;
  kind?: string;
  deliveries?: number;
  delivery: string;
  // Días que faltan para la entrega (negativo = atraso); null si el proceso ya no corre plazo.
  daysLeft?: number | null;
}) {
  const credit = kind === "credit";
  return (
    <section aria-label="Proceso abierto" className="flex flex-col gap-3 border-b border-foreground/10 bg-background px-5 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate caps text-muted-foreground">{code}</p>
        <p className="line-clamp-2 text-sm leading-snug font-semibold">{name}</p>
        {client && <p className="truncate text-xs text-muted-foreground">{client}</p>}
      </div>
      <StatusChip status={status} kind={kind} deliveries={deliveries} className="self-start" />
      {!credit && (
        <dl className="flex items-start justify-between gap-3 border-t pt-3 text-xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="truncate font-medium">{delivery}</dd>
          </div>
          {daysLeft != null && <Remaining days={daysLeft} />}
        </dl>
      )}
    </section>
  );
}

const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

// Segunda columna de la entrega: "Faltan / 12 días", "Vence / hoy" o "Atraso / 3 días" (en rojo).
function Remaining({ days: n }: { days: number }) {
  const [label, value] = n < 0 ? ["Atraso", days(-n)] : n === 0 ? ["Vence", "hoy"] : [n === 1 ? "Falta" : "Faltan", days(n)];
  return (
    <div className="min-w-0 shrink-0 text-right">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={n < 0 ? "font-medium text-destructive tabular-nums" : "font-medium tabular-nums"}>{value}</dd>
    </div>
  );
}
