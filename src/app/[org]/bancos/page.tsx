import { BankListPage } from "@/components/bank-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/bancos">) {
  return <BankListPage params={params} searchParams={searchParams} />;
}
