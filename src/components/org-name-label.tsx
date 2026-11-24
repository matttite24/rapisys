// Nombre de la organización con su rótulo debajo (no se repite la dirección: ya está en la barra del navegador).
export function OrgNameLabel({ name }: { name?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{name ?? " "}</p>
      <p className="truncate text-xs text-muted-foreground">Organización activa</p>
    </div>
  );
}
