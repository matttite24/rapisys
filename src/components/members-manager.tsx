"use client";

import { cn } from "@/lib/utils";
import { ConfirmTap } from "@/components/confirm-tap";
import { TABLE_TD, TABLE_TH as TH } from "@/components/page-section";
import { startTransition, useActionState, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  changeRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  type MemberState,
} from "@/app/[org]/ajustes/miembros/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABEL, type Role } from "@/lib/roles";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

const TD = `${TABLE_TD} align-middle`;

export type MemberView = {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  since: string;
};
export type InvitationView = { id: string; email: string; role: Role; token: string; expires: string };

export function MembersTable({
  org,
  members,
  meId,
  canManage,
}: {
  org: string;
  members: MemberView[];
  meId: string;
  canManage: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={TH}>Miembro</th>
            <th scope="col" className={TH}>Rol</th>
            <th scope="col" className={TH}>Desde</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberRow key={m.userId} org={org} m={m} isMe={m.userId === meId} canManage={canManage} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({
  org,
  m,
  isMe,
  canManage,
}: {
  org: string;
  m: MemberView;
  isMe: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<MemberState>, after?: () => void) {
    setPending(true);
    setError(undefined);
    let res: MemberState;
    try {
      res = await fn();
    } finally {
      setPending(false);
    }
    if (res?.error) {
      setError(res.error);
    } else after?.();
  }

  // Cualquiera puede salirse; solo un admin puede quitar a otros.
  const canRemove = canManage || isMe;

  return (
    <tr className="border-b last:border-b-0">
      <td className={TD}>
        <div className="font-medium">
          {m.name || m.email}
          {isMe && <span className="ml-2 font-mono text-xs text-muted-foreground">(tú)</span>}
        </div>
        {m.name && <div className="font-mono text-xs text-muted-foreground">{m.email}</div>}
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </td>
      <td className={TD}>
        {canManage ? (
          <NativeSelect
            aria-label={`Rol de ${m.name || m.email}`}
            value={m.role}
            disabled={pending}
            onChange={(e) =>
              startTransition(() => void run(() => changeRole(org, m.userId, e.target.value)))
            }
          >
            <option value="admin">{ROLE_LABEL.admin}</option>
            <option value="operator">{ROLE_LABEL.operator}</option>
          </NativeSelect>
        ) : (
          <span className="caps-md">{ROLE_LABEL[m.role]}</span>
        )}
      </td>
      <td className={`${TD} num`}>{day(m.since)}</td>
      <td className={`${TD} whitespace-nowrap`}>
        {canRemove && (
          <ConfirmTap
            variant="outline"
            disabled={pending}
            hint={isMe ? "Toca otra vez para salir" : "Toca otra vez para quitar"}
            hintSide="left"
            onConfirm={() =>
              void run(
                () => removeMember(org, m.userId),
                () => (isMe ? router.replace("/") : undefined),
              )
            }
          >
            {isMe ? "Salir" : "Quitar"}
          </ConfirmTap>
        )}
      </td>
    </tr>
  );
}

// Formulario de invitación. En el modal (`dialog`) va en columna, con el botón a todo el ancho abajo; en la página, en fila.
export function InviteForm({ org, days = 7, dialog = false }: { org: string; days?: number; dialog?: boolean }) {
  const [state, action, pending] = useActionState(inviteMember.bind(null, org), undefined);
  const [copied, setCopied] = useState(false);
  // El origen solo existe en el navegador: así no difiere entre el servidor y la hidratación.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const link = state?.token && origin ? `${origin}/invitacion/${state.token}` : undefined;

  return (
    <div className={cn("flex flex-col gap-4", dialog && "p-6")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const data = new FormData(e.currentTarget);
          setCopied(false);
          startTransition(() => action(data));
        }}
        noValidate
        className={cn(
          dialog ? "flex flex-col gap-5" : "grid gap-4 md:grid-cols-[1fr_14rem_auto] md:items-start",
        )}
      >
        <FormField name="email" label="Correo">
          {(a11y) => <Input {...a11y} type="email" required className="font-mono" autoComplete="off" />}
        </FormField>
        <FormField name="role" label="Rol">
          {(a11y) => (
            <NativeSelect {...a11y} className="w-full" defaultValue="operator">
              <option value="operator">{ROLE_LABEL.operator}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </NativeSelect>
          )}
        </FormField>
        <Button type="submit" disabled={pending} className={dialog ? "h-10 w-full" : "md:mt-[1.35rem]"}>
          {pending ? "Creando…" : "Crear invitación"}
        </Button>
      </form>

      {state?.error && <FieldError>{state.error}</FieldError>}

      {link && (
        <div className="flex flex-col gap-2 border bg-muted/50 p-4">
          <p className="text-sm">
            Comparte este enlace con <strong>{state?.email}</strong>. Solo funciona con ese correo y vence en {days} {days === 1 ? "día" : "días"}.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Enlace de invitación" className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InvitationsTable({ org, invitations }: { org: string; invitations: InvitationView[] }) {
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();

  return (
    <div className="overflow-x-auto">
      {error && <p role="alert" className="px-4 py-2 text-sm text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={TH}>Correo</th>
            <th scope="col" className={TH}>Rol</th>
            <th scope="col" className={TH}>Vence</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((i) => (
            <tr key={i.id} className="border-b last:border-b-0">
              <td className={`${TD} font-mono text-xs`}>{i.email}</td>
              <td className={TD}>
                <span className="caps-md">{ROLE_LABEL[i.role]}</span>
              </td>
              <td className={`${TD} num`}>{day(i.expires)}</td>
              <td className={`${TD} whitespace-nowrap`}>
                <span className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/invitacion/${i.token}`);
                      setCopied(i.id);
                    }}
                  >
                    {copied === i.id ? "Copiado" : "Copiar enlace"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const res = await revokeInvitation(org, i.id);
                      setError(res?.error);
                    }}
                  >
                    Revocar
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
