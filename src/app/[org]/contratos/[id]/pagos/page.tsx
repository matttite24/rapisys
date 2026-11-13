import { PaymentsPage } from "@/components/payments-view";

export default function Page(props: PageProps<"/[org]/contratos/[id]/pagos">) {
  return <PaymentsPage params={props.params} searchParams={props.searchParams} />;
}
