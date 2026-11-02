import { Suspense } from "react";
import { connection } from "next/server";
import { ContractForm } from "@/components/contract-form";
import { PageSection } from "@/components/page-section";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

async function Form({ params }: { params: PageProps<"/[org]/contratos/nuevo">["params"] }) {
  await connection();
  const { org } = await params;
  const orgId = await getOrgId(org);
  const supabase = await createClient();

  const [clients, managers] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", orgId ?? "").order("name"),
    supabase.from("contract_managers").select("id, name").eq("organization_id", orgId ?? "").order("name"),
  ]);

  return (
    <ContractForm org={org} clients={clients.data ?? []} managers={managers.data ?? []} />
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
