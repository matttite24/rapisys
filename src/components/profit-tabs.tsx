"use client";

import { useState } from "react";
import { TAB, TABS_ROW, TabCount } from "@/components/count-tabs";

// Pestañas de la revisión: una por lista, más facturas y gastos. Cada panel llega ya armado desde el servidor.
export function ProfitTabs({ tabs }: { tabs: { key: string; label: string; count: number; panel: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <>
      <nav aria-label="Revisión por lista, facturas y gastos" className={TABS_ROW}>
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={current?.key === t.key} onClick={() => setActive(t.key)} className={TAB(current?.key === t.key)}>
            <span className="max-w-48 truncate">{t.label}</span> <TabCount n={t.count} active={current?.key === t.key} />
          </button>
        ))}
      </nav>
      {current?.panel}
    </>
  );
}
