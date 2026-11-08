"use client";

import { startTransition, useState } from "react";
import { Cancel01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CELL_ROW } from "@/components/cell-header";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createParty } from "@/lib/party-actions";
import { PARTIES, CLIENT_TYPES, type PartyKind } from "@/lib/parties";

// Cajón lateral para crear un cliente, proveedor o responsable desde cualquier pantalla, sin perder lo que se
// está haciendo. Al crear llama a `onCreated` con el registro nuevo. Se deja montado y se controla con `open`
// para que entre y salga con animación; el formulario vive dentro del contenido, que se desmonta al cerrar,
// así cada apertura empieza limpia (toma `initial` al abrirse).
type Props = {
  kind: PartyKind;
  org: string;
  open: boolean;
  initial?: { name?: string; ruc?: string; address?: string };
  onClose: () => void;
  onCreated: (party: { id: string; name: string }) => void;
};

export function PartyDrawer(props: Props) {
  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent showCloseButton={false} className="gap-0 bg-background data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <PartyDrawerBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

function PartyDrawerBody({ kind, org, initial, onClose, onCreated }: Props) {
  const cfg = PARTIES[kind];
  const [name, setName] = useState(initial?.name ?? "");
  const [ruc, setRuc] = useState(initial?.ruc ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [clientType, setClientType] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  function submit() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    startTransition(async () => {
      const res = await createParty(kind, org, { name, ruc, address, ...(kind === "clients" ? { clientType } : {}) });
      if (res.id) {
        onCreated({ id: res.id, name: res.name ?? name });
        return onClose();
      }
      setErrors(res.fields ?? {});
      setError(res.error);
      setPending(false);
    });
  }

  return (
    <>
      <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
        <SheetTitle className="caps-md min-w-0 truncate font-medium">{cfg.newLabel}</SheetTitle>
        <SheetDescription className="sr-only">Crea el {cfg.singular} sin salir de la pantalla.</SheetDescription>
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" disabled={pending} onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
        </Button>
      </SheetHeader>
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 [&_input]:bg-background">
        {kind === "clients" && <FormField name="party-client-type" label="Tipo de cliente" error={errors.client_type}>
          {(props) => <NativeSelect {...props} className="w-full" value={clientType} onChange={(event) => setClientType(event.target.value)}><option value="" disabled>Selecciona…</option>{Object.entries(CLIENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}
        </FormField>}
        <FormField name="party-name" label="Nombre" error={errors.name}>
          {(a11y) => <Input {...a11y} required autoFocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField
          name="party-ruc"
          label="RUC o cédula (opcional)"
          error={errors.ruc}
          hint="13 dígitos para un RUC, 10 para una cédula"
        >
          {(a11y) => <NumericInput {...a11y} maxLength={13} className="font-mono" value={ruc} onChange={(e) => setRuc(e.target.value)} />}
        </FormField>
        <FormField name="party-address" label="Dirección (opcional)">
          {(a11y) => <Input {...a11y} autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />}
        </FormField>
        {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/20 p-4">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} className="gap-2">
            <HugeiconsIcon icon={UserAdd01Icon} className="size-4" />
            {pending ? "Guardando…" : `Crear ${cfg.singular}`}
          </Button>
        </div>
      </form>
    </>
  );
}
