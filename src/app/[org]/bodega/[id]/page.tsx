import { ItemEditPage } from "@/components/item-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/[id]">) {
  return <ItemEditPage params={params} />;
}
