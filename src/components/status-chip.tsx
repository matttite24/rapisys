import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/contracts";
import { TONE_DOT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

// Fase del contrato: cuadro de color suave con un punto del mismo tono.
export function StatusChip({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "pending";
  return (
    <Badge variant={tone} className={cn("gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
