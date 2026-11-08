import { redirectContractFilter } from "@/lib/redirect-contract-filter";

export default async function Page({ params, searchParams }: PageProps<"/[org]/contratos/nuevos">) {
  return redirectContractFilter(params, searchParams, "nuevos");
}
