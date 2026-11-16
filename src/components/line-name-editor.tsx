"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { renameLine } from "@/lib/contract-actions";

// Nombre de la línea abierta, editable: se guarda al salir del campo o con Enter; Esc lo deja como estaba.
export function LineNameEditor({ org, contractId, lineId, name }: { org: string; contractId: string; lineId: string; name: string }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = value.trim();
    if (busy || next === name) return setValue(name);
    setBusy(true);
    try {
      const res = await renameLine(org, contractId, lineId, next);
      if (res?.error) {
        toast.error(res.error);
        setValue(name);
      } else toast.success("Nombre actualizado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-b px-4 py-3">
      <label htmlFor={`line-name-${lineId}`} className="text-xs text-muted-foreground">Nombre de la línea</label>
      <Input
        id={`line-name-${lineId}`}
        value={value}
        maxLength={500}
        disabled={busy}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(name);
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
