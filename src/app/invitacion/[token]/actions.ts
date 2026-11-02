"use server";

import { redirect } from "next/navigation";
import type { AuthState } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvitation(
  token: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _: AuthState,
): Promise<AuthState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };
  redirect(`/${data.slug}/inicio`);
}
