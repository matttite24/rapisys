import { redirectContractFilter } from "@/lib/redirect-contract-filter";

export default async function Page({ params, searchParams }: PageProps<"/[org]/contratos/cobrados">) {
  return redirectContractFilter(params, searchParams, "cobrados");
}
