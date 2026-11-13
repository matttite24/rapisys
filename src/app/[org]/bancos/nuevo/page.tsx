import { BankNewPage } from "@/components/bank-pages";

export default function Page({ params }: PageProps<"/[org]/bancos/nuevo">) {
  return <BankNewPage params={params} />;
}
