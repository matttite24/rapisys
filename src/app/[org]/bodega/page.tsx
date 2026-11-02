import { ItemListPage } from "@/components/item-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/bodega">) {
  return <ItemListPage params={params} searchParams={searchParams} />;
}
