import { startTransition, useState } from "react";
import { type ListState } from "@/lib/contract-list-actions";

export function useListSubmit(onDone: (id?: string) => void) {
  const [state, setState] = useState<ListState>();
  const [saving, setSaving] = useState(false);
  function submit(run: () => Promise<ListState>) {
    if (saving) return;
    setSaving(true);
    setState(undefined);
    startTransition(async () => {
      const res = await run();
      setSaving(false);
      if (res?.error || res?.fields) setState(res);
      else onDone(res?.id);
    });
  }
  return { state, saving, submit };
}
