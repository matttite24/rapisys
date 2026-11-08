import { DirectoryPage } from "@/components/directory-page";
export default function Page({ params, searchParams }: PageProps<"/[org]/directorio">) {
  return <DirectoryPage params={params} searchParams={searchParams} />;
}
