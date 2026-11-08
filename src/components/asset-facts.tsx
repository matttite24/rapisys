"use client";

import {
  BarCode01Icon,
  Building03Icon,
  Calendar03Icon,
  Car01Icon,
  EngineIcon,
  IdentityCardIcon,
  InformationCircleIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useLayoutEffect, useRef } from "react";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { cn } from "@/lib/utils";

export type AssetData = {
  kind: string;
  brand: string;
  model: string;
  serial: string;
  engine: string;
  year: string;
  identifier: string;
  other: string;
};

export type AssetFact = { icon: IconSvgElement; label: string; value: string };

// Los datos del activo que están llenos, en orden (tipo, marca, modelo, serie, serie del motor, año, identificación y otro).
// Un dato sin llenar no aparece, ni su ícono.
export function assetFactList(asset: AssetData): AssetFact[] {
  return [
    { icon: Tag01Icon, label: "Tipo", value: ASSET_KIND_LABEL[asset.kind as AssetKind] ?? "" },
    { icon: Building03Icon, label: "Marca", value: asset.brand },
    { icon: Car01Icon, label: "Modelo", value: asset.model },
    { icon: BarCode01Icon, label: "Serie", value: asset.serial },
    { icon: EngineIcon, label: "Serie del motor", value: asset.engine },
    { icon: Calendar03Icon, label: "Año de fabricación", value: asset.year },
    { icon: IdentityCardIcon, label: "N.º de identificación", value: asset.identifier },
    { icon: InformationCircleIcon, label: "Otro", value: asset.other },
  ].filter((f) => f.value.trim() !== "");
}

// Un dato: ícono, etiqueta pequeña y valor.
export function FactItem({ fact, className }: { fact: AssetFact; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-2", className)} title={`${fact.label}: ${fact.value}`}>
      <HugeiconsIcon icon={fact.icon} className="size-4 shrink-0 translate-y-0.5 self-center text-muted-foreground" aria-hidden />
      <span className="shrink-0 text-xs text-muted-foreground">{fact.label}</span>
      <span className="text-sm font-medium break-words">{fact.value}</span>
    </div>
  );
}

// Los datos en UNA sola línea, sin desplazamiento: se muestran los que caben en el ancho y el resto queda oculto (sigue
// ocupando su lugar, recortado). `onHiddenChange` avisa cuántos (desde el final) no caben, para mostrarlos aparte.
export function AssetFactsLine({
  facts,
  onHiddenChange,
  className,
}: {
  facts: AssetFact[];
  onHiddenChange: (hidden: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      const limit = el.clientWidth;
      let fit = 0;
      for (const k of kids) {
        if (k.offsetLeft + k.offsetWidth <= limit) fit++;
        else break;
      }
      kids.forEach((k, i) => (k.style.visibility = i < fit ? "visible" : "hidden"));
      onHiddenChange(kids.length - fit);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [facts, onHiddenChange]);

  return (
    <div ref={ref} className={cn("relative flex min-w-0 flex-nowrap gap-x-8 overflow-hidden whitespace-nowrap", className)}>
      {facts.map((f) => (
        <FactItem key={f.label} fact={f} className="shrink-0" />
      ))}
    </div>
  );
}

// Los datos completos, en las filas que hagan falta (para el panel que se despliega).
export function AssetFactsWrap({ facts, className }: { facts: AssetFact[]; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap gap-x-8 gap-y-3", className)}>
      {facts.map((f) => (
        <FactItem key={f.label} fact={f} />
      ))}
    </div>
  );
}
