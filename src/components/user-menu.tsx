import { connection } from "next/server";
import { AccountMenu } from "@/components/account-menu";
import { createClient } from "@/lib/supabase/server";

export async function UserMenu() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AccountMenu email={user?.email} />;
}
