import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { OrgSwitcher } from "@/components/org-switcher";
import { OrgNameLabel } from "@/components/org-name-label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/user-menu";
import { createClient } from "@/lib/supabase/server";

// Todo el shell depende de la organización de la URL, así que se resuelve en
// cada request. RLS solo devuelve organizaciones donde el usuario es miembro.
async function OrgShell({
  params,
  children,
}: {
  params: LayoutProps<"/[org]">["params"];
  children: React.ReactNode;
}) {
  await connection();
  const { org } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", org)
    .maybeSingle();
  if (!data) notFound();

  return (
    <TooltipProvider>
      <AppShell
        org={org}
        account={
          <Suspense>
            <UserMenu />
          </Suspense>
        }
        orgSwitcher={
          <Suspense
            fallback={
              <div className="px-4">
                <OrgNameLabel slug={org} />
              </div>
            }
          >
            <OrgSwitcher org={org} />
          </Suspense>
        }
      >
        {children}
      </AppShell>
    </TooltipProvider>
  );
}

export default function OrgLayout({ children, params }: LayoutProps<"/[org]">) {
  return (
    <Suspense>
      <OrgShell params={params}>{children}</OrgShell>
    </Suspense>
  );
}
