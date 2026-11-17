import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  InvitationsTable,
  MembersTable,
  type InvitationView,
  type MemberView,
} from "@/components/members-manager";
import { InviteDialog } from "@/components/invite-dialog";
import { PageSection } from "@/components/page-section";
import { PageFigures } from "@/components/page-shortcuts";
import { getUser } from "@/lib/auth";
import { getMyRole, getOrgId } from "@/lib/orgs";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

async function Members({ params }: { params: PageProps<"/[org]/ajustes/miembros">["params"] }) {
  await connection();
  const { org } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const [supabase, user, role] = await Promise.all([createClient(), getUser(), getMyRole(orgId)]);
  const isAdmin = role === "admin";

  const [settingsRes, membersRes, invitesRes] = await Promise.all([
    supabase.from("organizations").select("invitation_days").eq("id", orgId).maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id, role, created_at, profiles(email, full_name)")
      .eq("organization_id", orgId)
      .order("created_at"),
    isAdmin
      ? supabase
          .from("invitations")
          .select("id, email, role, token, expires_at")
          .eq("organization_id", orgId)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  type MRow = {
    user_id: string;
    role: Role;
    created_at: string;
    profiles: { email: string; full_name: string | null } | null;
  };
  const inviteDays = Number(settingsRes.data?.invitation_days ?? 7);
  const members: MemberView[] = ((membersRes.data ?? []) as unknown as MRow[]).map((r) => ({
    userId: r.user_id,
    name: r.profiles?.full_name ?? null,
    email: r.profiles?.email ?? "(sin correo)",
    role: r.role,
    since: r.created_at,
  }));
  const invitations: InvitationView[] = (
    (invitesRes.data ?? []) as { id: string; email: string; role: Role; token: string; expires_at: string }[]
  ).map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expires: i.expires_at }));

  return (
    <>
      {/* El conteo va en la barra inferior; la tabla no necesita su propio título. */}
      <PageFigures figures={[{ label: "", value: String(members.length), note: members.length === 1 ? "miembro" : "miembros" }]} />
      <PageSection className="p-0">
        <MembersTable org={org} members={members} meId={user?.id ?? ""} canManage={isAdmin} />
      </PageSection>

      {isAdmin && (
        <>
          {/* Invitar va en el encabezado y abre un modal; las invitaciones pendientes quedan debajo. */}
          <InviteDialog org={org} days={inviteDays} />
          {invitations.length > 0 && (
            <PageSection
              label={`${invitations.length} ${invitations.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}`}
              className="p-0"
            >
              <InvitationsTable org={org} invitations={invitations} />
            </PageSection>
          )}
        </>
      )}
    </>
  );
}

export default function MembersPage({ params }: PageProps<"/[org]/ajustes/miembros">) {
  return (
    <>
      <PageSection>
        <h1 className="text-2xl font-semibold tracking-tight">Miembros</h1>
      </PageSection>
      <Suspense>
        <Members params={params} />
      </Suspense>
    </>
  );
}
