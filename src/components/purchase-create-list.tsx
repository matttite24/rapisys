"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageProcessIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { createListFromPurchase } from "@/lib/purchase-actions";

// Proceso a crédito, con la factura ya recibida: crea la lista con todas sus líneas (cantidad y precio) y las abastece.
// Si la lista ya se creó, lleva a ella.
export function CreateListFromPurchase({ org, contractId, purchaseId, listId }: { org: string; contractId: string; purchaseId: string; listId?: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const base = `/${org}/contratos/${contractId}/abastecimiento`;

  if (listId) {
    return (
      <Link href={`${base}?lista=${listId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Ver la lista creada
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      className="gap-2 px-3"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await createListFromPurchase(org, contractId, purchaseId);
          if (res.error || !res.listId) return void toast.error(res.error ?? "No se pudo crear la lista.");
          toast.success("Lista creada y abastecida con la factura.");
          router.push(`${base}?lista=${res.listId}`);
        })
      }
    >
      <HugeiconsIcon icon={PackageProcessIcon} className="size-4" />
      {busy ? "Creando la lista…" : "Crear lista y abastecer"}
    </Button>
  );
}
