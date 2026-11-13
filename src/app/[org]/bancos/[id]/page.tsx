import { BankEditPage } from "@/components/bank-pages";

export default function Page({ params }: PageProps<"/[org]/bancos/[id]">) {
  return <BankEditPage params={params} />;
}
