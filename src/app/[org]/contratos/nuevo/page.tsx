import { Suspense } from "react";
import { connection } from "next/server";
import { ContractForm } from "@/components/contract-form";
import { PageSection } from "@/components/page-section";

async function Form({ params }: { params: PageProps<"/[org]/contratos/nuevo">["params"] }) {
  await connection();
  const { org } = await params;

  return (
    <ContractForm org={org} />
  );
}

export default function NewContractPage({ params }: PageProps<"/[org]/contratos/nuevo">) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo contrato</h1>
      </PageSection>
      <Suspense>
        <Form params={params} />
      </Suspense>
    </>
  );
}
