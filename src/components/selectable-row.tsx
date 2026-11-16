"use client";

// Fila que se comporta como botón pero deja seleccionar y copiar su texto. Un <button> no deja arrastrar para seleccionar;
// aquí el clic se ignora si lo que se hizo fue seleccionar texto.
export function SelectableRow({
  selected,
  onActivate,
  className,
  children,
}: {
  selected: boolean;
  onActivate: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => {
        if (window.getSelection()?.toString()) return;
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={`cursor-pointer select-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
