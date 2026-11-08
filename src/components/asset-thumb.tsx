import { cn } from "@/lib/utils";

// Fotos de ejemplo mientras los activos no tengan foto propia (public/Dummies). Se elige una por activo de forma
// estable: el mismo id muestra siempre la misma imagen.
const DUMMIES = [
  "Forklift", "Dolly", "Engine Hoist ", "File Cabinet ", "llantas",
  "image-Nx16bLhW5uqRaBm8ysDitzi23CZr1Z", "image-Co7Y43IXIqna0bWJp09V4VrXP1K7am", "image-CS8THBiwYgXz5pPGm24ZKFzclkY0EN",
  "image-qkVWFJyFeLwc2TFeRkQDjsMUqGwA93", "image-ZuqkRgYlz9vFgnIQmoJqhNqqbet1CP", "image-LmSCpVzC7OrX1hMd0SWHSikl7O0ZOr",
  "image-h2A4Uc1Cc525S7jCcyMH4DbNxtt86C", "image-cTYqpGbKQ1Nr4FvewK9oNO2xmuMHos", "image-JgagqfPJ52ovXvCZc6gQrjRpakDVh7",
];

function pick(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DUMMIES[h % DUMMIES.length];
}

export function AssetThumb({ id, className }: { id: string; className?: string }) {
  // alt vacío: es decorativa, el nombre del activo ya está en el texto.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/Dummies/${encodeURIComponent(pick(id))}.avif`} alt="" loading="lazy" className={cn("size-10 shrink-0 rounded-md bg-muted object-cover", className)} />;
}
