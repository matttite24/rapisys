import { connection } from "next/server";
import { OrgSwitcherMenu } from "@/components/org-switcher-menu";
import { getMyOrgs } from "@/lib/orgs";

export async function OrgSwitcher({ org, side }: { org: string; side?: "top" | "bottom" }) {
  await connection();
  return <OrgSwitcherMenu orgs={await getMyOrgs()} org={org} side={side} />;
}
