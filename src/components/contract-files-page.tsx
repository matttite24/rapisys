import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { FilesBoard, type FileRow } from "@/components/files-board";
import { PageLoading } from "@/components/page-loading";
import { getContract } from "@/lib/contract-data";
import { FILES_BUCKET, type FileSource } from "@/lib/files";
import { pageCount, pageRange, readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

// Archivos por página: solo se piden (y se firman las miniaturas de) los que se ven.
export const FILES_PAGE_SIZE = 25;
const ORIGINS: Record<string, FileSource> = { contrato: "contract", compras: "purchase", gastos: "expense" };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Files({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const [{ org, id }, sp, supabase] = await Promise.all([params, searchParams, createClient()]);
  const found = await getContract(org, id);
  if (!found) notFound();

  const origin = first(sp.origen) ?? "";
  const source = ORIGINS[origin];
  const countsRes = await supabase.rpc("contract_files_counts", { p_contract_id: id });
  const c = (countsRes.data ?? {}) as { contract?: number; purchase?: number; expense?: number; bytes?: number };
  const counts = { contract: Number(c.contract ?? 0), purchase: Number(c.purchase ?? 0), expense: Number(c.expense ?? 0) };
  const all = counts.contract + counts.purchase + counts.expense;
  const total = source ? counts[source] : all;

  // Si la página pedida ya no existe (se borraron archivos), se muestra la última.
  const page = Math.min(readPage(sp), pageCount(total, FILES_PAGE_SIZE));
  const [from, to] = pageRange(page, FILES_PAGE_SIZE);
  let query = supabase
    .from("contract_files")
    .select("id, name, source, source_id, mime_type, size_bytes, created_at, thumb_path")
    .eq("contract_id", id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (source) query = query.eq("source", source);
  const { data } = await query;
  const rows = (data ?? []) as {
    id: string;
    name: string;
    source: FileSource;
    source_id: string | null;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    thumb_path: string | null;
  }[];

  // Nombre de la compra o del gasto de cada archivo de esta página, y miniaturas firmadas en una sola llamada.
  const purchaseIds = [...new Set(rows.filter((f) => f.source === "purchase" && f.source_id).map((f) => f.source_id as string))];
  const expenseIds = [...new Set(rows.filter((f) => f.source === "expense" && f.source_id).map((f) => f.source_id as string))];
  const thumbPaths = rows.map((f) => f.thumb_path).filter((p): p is string => !!p);
  const [purchases, expenses, signed] = await Promise.all([
    purchaseIds.length ? supabase.from("purchases").select("id, number").in("id", purchaseIds) : Promise.resolve({ data: [] }),
    expenseIds.length ? supabase.from("contract_expenses").select("id, concept").in("id", expenseIds) : Promise.resolve({ data: [] }),
    thumbPaths.length ? supabase.storage.from(FILES_BUCKET).createSignedUrls(thumbPaths, 3600) : Promise.resolve(null),
  ]);
  const purchaseName = new Map(((purchases.data ?? []) as { id: string; number: string | null }[]).map((p) => [p.id, p.number ?? "Sin número"]));
  const expenseName = new Map(((expenses.data ?? []) as { id: string; concept: string }[]).map((e) => [e.id, e.concept]));
  const thumbUrl = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));

  const files: FileRow[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    source: f.source,
    sourceLabel: f.source === "contract" ? undefined : ((f.source === "purchase" ? purchaseName : expenseName).get(f.source_id ?? "") ?? "(eliminado)"),
    mime: f.mime_type,
    size: Number(f.size_bytes),
    createdAt: f.created_at,
    thumbUrl: (f.thumb_path && thumbUrl.get(f.thumb_path)) || undefined,
  }));

  return (
    <FilesBoard
      org={org}
      contractId={id}
      files={files}
      counts={{ all, ...counts }}
      origin={source ? origin : ""}
      page={page}
      total={total}
      bytes={Number(c.bytes ?? 0)}
      pageSize={FILES_PAGE_SIZE}
    />
  );
}

export function ContractFilesPage({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Files params={params} searchParams={searchParams} />
    </Suspense>
  );
}
