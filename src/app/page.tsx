import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lleva al usuario a su primera organización, o a crear una si no tiene.
async function Redirector() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("organizations(slug)")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const org = data?.organizations as { slug: string } | { slug: string }[] | null | undefined;
  const slug = Array.isArray(org) ? org[0]?.slug : org?.slug;
  return redirect(slug ? `/${slug}/contratos` : "/onboarding");
}

export default function Home() {
  return (
    <Suspense>
      <Redirector />
    </Suspense>
  );
}
