import { ItemNewPage } from "@/components/item-pages";

export default function Page({ params }: PageProps<"/[org]/bodega/nuevo">) {
  return <ItemNewPage params={params} />;
}
