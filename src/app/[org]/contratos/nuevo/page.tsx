import { Suspense } from "react";
import { connection } from "next/server";
import { ContractForm } from "@/components/contract-form";
import { PageSection } from "@/components/page-section";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

async function Form({ params }: { params: PageProps<"/[org]/contratos/nuevo">["params"] }) {
  await connection();
  const { org } = await params;
  const [orgId, supabase] = await Promise.all([getOrgId(org), createClient()]);

  const settings = await supabase.from("organizations").select("vat_rate").eq("id", orgId ?? "").maybeSingle();

  return (
    <ContractForm
      org={org}
      defaultVatRate={settings.data?.vat_rate != null ? Number(settings.data.vat_rate) : undefined}
    />
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
