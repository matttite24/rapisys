import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { FilesBoard, type FileRow, type SourceOption } from "@/components/files-board";
import { PageLoading } from "@/components/page-loading";
import { getContract } from "@/lib/contract-data";
import type { FileSource } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;

async function Files({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);
  const found = await getContract(org, id);
  if (!found) notFound();

  const [filesRes, purchasesRes, expensesRes] = await Promise.all([
    supabase
      .from("contract_files")
      .select("id, name, source, source_id, mime_type, size_bytes, created_at")
      .eq("contract_id", id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("purchases").select("id, number, purchased_on").eq("contract_id", id).order("purchased_on", { ascending: false }).limit(500),
    supabase.from("contract_expenses").select("id, concept, spent_on").eq("contract_id", id).order("spent_on", { ascending: false }).limit(500),
  ]);

  const purchases: SourceOption[] = ((purchasesRes.data ?? []) as { id: string; number: string | null }[]).map((p) => ({ id: p.id, label: p.number ?? "Sin número" }));
  const expenses: SourceOption[] = ((expensesRes.data ?? []) as { id: string; concept: string }[]).map((e) => ({ id: e.id, label: e.concept }));
  const files: FileRow[] = ((filesRes.data ?? []) as {
    id: string;
    name: string;
    source: FileSource;
    source_id: string | null;
    mime_type: string;
    size_bytes: number;
    created_at: string;
  }[]).map((f) => ({
    id: f.id,
    name: f.name,
    source: f.source,
    sourceId: f.source_id,
    mime: f.mime_type,
    size: Number(f.size_bytes),
    createdAt: f.created_at,
  }));

  return <FilesBoard org={org} contractId={id} files={files} purchases={purchases} expenses={expenses} />;
}

export function ContractFilesPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Files params={params} />
    </Suspense>
  );
}
