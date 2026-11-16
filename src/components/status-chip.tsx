import { Badge } from "@/components/ui/badge";
import { STATUS_TONE, statusText } from "@/lib/contracts";
import { TONE_DOT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

// Fase del proceso: cuadro de color suave con un punto del mismo tono.
export function StatusChip({ status, kind, deliveries, className }: { status: string; kind?: string; deliveries?: number; className?: string }) {
  const tone = kind === "credit" && status === "in_progress" && deliveries ? "partial" : (STATUS_TONE[status] ?? "pending");
  return (
    <Badge variant={tone} className={cn("gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {statusText(status, kind, deliveries)}
    </Badge>
  );
}
