import { Suspense } from "react";
import { InviteForm } from "@/components/invite-form";

async function Invite({ params }: { params: PageProps<"/invitacion/[token]">["params"] }) {
  const { token } = await params;
  return <InviteForm token={token} />;
}

export default function InvitePage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Suspense>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}
