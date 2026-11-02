import { connection } from "next/server";
import { AccountMenu } from "@/components/account-menu";
import { getUser } from "@/lib/auth";

export async function UserMenu() {
  await connection();
  const user = await getUser();

  return <AccountMenu email={user?.email} />;
}
