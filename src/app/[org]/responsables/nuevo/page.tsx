import { redirectLegacyParty } from "@/lib/redirect-party";
export default async function Page({ params, searchParams }: PageProps<"/[org]/responsables/nuevo">) {
  return redirectLegacyParty("managers", params, searchParams, "new");
}
