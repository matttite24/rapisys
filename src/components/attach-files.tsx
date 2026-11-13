"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Attachment01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilesUploadDialog } from "@/components/files-upload-dialog";
import { Button } from "@/components/ui/button";

// Adjuntar archivos a una compra o a un gasto, desde su propia pantalla.
export function AttachFiles({
  org,
  contractId,
  source,
  sourceId,
  label,
  count = 0,
  iconOnly,
  variant = "outline",
}: {
  org: string;
  contractId: string;
  source: "purchase" | "expense";
  sourceId: string;
  label: string;
  count?: number;
  iconOnly?: boolean;
  variant?: "outline" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const text = count > 0 ? `Adjuntos (${count})` : "Adjuntar archivo";
  return (
    <>
      {iconOnly ? (
        <Button variant="ghost" size="icon" aria-label={`${text}: ${label}`} title={text} onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
          {count > 0 && <span className="num text-xs">{count}</span>}
        </Button>
      ) : (
        <Button variant={variant} onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={Attachment01Icon} aria-hidden className="size-4" />
          {text}
        </Button>
      )}
      <FilesUploadDialog
        org={org}
        contractId={contractId}
        fixed={{ source, id: sourceId, label }}
        open={open}
        onOpenChange={setOpen}
        onUploaded={() => router.refresh()}
      />
    </>
  );
}
