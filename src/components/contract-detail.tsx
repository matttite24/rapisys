import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { partyName } from "@/lib/party-name";
import { ContractForm } from "@/components/contract-form";
import { ContractDashboard } from "@/components/contract-dashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";

type IdParams = Promise<{ org: string; id: string }>;

// Detalle del proceso. El cliente y el estado ya están en el encabezado (layout).
async function Detail({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const found = await getContract(org, id);
  if (!found) notFound();
  const { orgId, c } = found;

  // En estado Nuevo se corrigen los datos del proceso; los items aún no se cargan.
  if (c.status === "new") {
    const [clientName, managerName] = await Promise.all([
      partyName(orgId, "client", c.client_id),
      partyName(orgId, "manager", c.manager_id),
    ]);
    return (
      <>
        <PageSection>
          <h1 className="text-lg leading-snug font-semibold">{c.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            El proceso está en <strong className="text-foreground">Nuevo</strong>: corrige aquí sus datos
            cuando haga falta. Los items se cargan y se trabajan desde{" "}
            <strong className="text-foreground">En ejecución</strong>.
          </p>
        </PageSection>
        <ContractForm
          org={org}
          clientName={clientName}
          managerName={managerName}
          contract={{
            id,
            name: c.name,
            code: c.code,
            clientId: c.client_id,
            managerId: c.manager_id,
            totalCents: Number(c.total_cents ?? 0),
            startDate: c.start_date,
            termDays: Number(c.term_days ?? 0),
            vatRate: Number(c.vat_rate),
          }}
        />
      </>
    );
  }

  return <ContractDashboard org={org} id={id} c={c} />;
}

// Esqueleto del detalle: la misma estructura que el dashboard (banda con tres cifras, abastecimiento y compras, tablas y
// listas), así lo que llega después no mueve nada.
function TableCardSkeleton() {
  return (
    <Card size="sm">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ContractDetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando el proceso" className="flex flex-col">
      <section className="border-b bg-surface-strong">
        <div className="flex items-end justify-between gap-8 pl-6 pr-6 xl:pr-10">
          <div className="flex min-w-0 flex-1 flex-col gap-8 py-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-28 bg-foreground/10" />
                <Skeleton className="h-4 w-32 bg-foreground/10" />
              </div>
              <Skeleton className="h-10 w-3/5 max-w-xl bg-foreground/10" />
              <Skeleton className="h-4 w-80 max-w-full bg-foreground/10" />
            </div>
            <div className="grid max-w-4xl gap-6 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-32 bg-foreground/10" />
                  <Skeleton className="h-8 w-40 bg-foreground/10" />
                  <Skeleton className="h-2 w-full bg-foreground/10" />
                  <Skeleton className="h-3 w-36 bg-foreground/10" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="hidden size-64 shrink-0 translate-y-4 bg-foreground/10 xl:block" />
        </div>
      </section>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <Card size="sm" className="xl:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-3 w-full" />
              <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardHeader>
            <CardContent className="mt-auto">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <TableCardSkeleton />
          <TableCardSkeleton />
        </div>
      </div>
    </div>
  );
}

export function ContractDetailPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<ContractDetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}
