export function OrgNameLabel({ name, slug }: { name?: string; slug: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{name ?? " "}</p>
      <p className="truncate font-mono text-xs text-muted-foreground">{slug}</p>
    </div>
  );
}
