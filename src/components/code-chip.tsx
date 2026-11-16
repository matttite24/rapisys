// Código interno de una línea: el segundo código, junto al número de parte, como chip.
export function CodeChip({ code }: { code: string }) {
  if (!code) return null;
  return (
    <span title="Código interno" className="inline-flex h-5 max-w-full items-center rounded-sm border bg-muted px-1.5 align-middle font-mono text-2xs font-medium text-foreground/80">
      <span className="truncate">{code}</span>
    </span>
  );
}
