import { ItemNewPage } from "@/components/item-pages";

export default function Page({ params, searchParams }: PageProps<"/[org]/bodega/nuevo">) {
  return <ItemNewPage params={params} searchParams={searchParams} />;
}
