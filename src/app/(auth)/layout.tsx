import { ThemeToggle } from "@/components/theme-toggle";

// Pantalla de entrada: un solo formulario al centro. Sus cuatro bordes se alargan hasta los límites de la pantalla y el
// formulario es la celda que forman al cruzarse (el mismo lenguaje de líneas finas del marco de la app).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute top-3 right-3">
        <ThemeToggle variant="ghost" />
      </div>
      {children}
    </main>
  );
}
