"use client";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="space-y-3 p-4"><p className="text-sm text-destructive">{message}</p><Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button></div>;
}

// Fila de búsqueda del panel (el buscador del sistema). `children` va a la derecha.
export function SearchRow({
  label,
  placeholder,
  value,
  onChange,
  autoFocus,
  children,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 border-b">
      <SearchInput label={label} placeholder={placeholder} value={value} onChange={onChange} autoFocus={autoFocus}>
        {children}
      </SearchInput>
    </div>
  );
}
