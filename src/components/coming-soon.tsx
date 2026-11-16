import { PageSection } from "@/components/page-section";

// Parte del proceso que aún no se construye: ocupa su lugar en el cambiador.
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageSection label={title}>
      <p className="max-w-xl text-muted-foreground">{children}</p>
    </PageSection>
  );
}
