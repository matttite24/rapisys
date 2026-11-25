"use client";

import { useState } from "react";
import { DeliveryLines, type DeliveryLine } from "@/components/delivery-lines";
import { DeliveryPhotos, type DeliveryPhoto } from "@/components/delivery-photos";
import { EditDelivery } from "@/components/edit-delivery";
import { FolderTabs } from "@/components/folder-tabs";
import { VoidDelivery } from "@/components/void-delivery";
import { Badge } from "@/components/ui/badge";
import { formatIso } from "@/lib/dates";

type Tab = "lines" | "photos";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="caps text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

// La entrega con la misma forma que Abastecimiento: pestañas con su acción discreta a la derecha, una franja con los datos
// y debajo la lista (líneas o fotos).
export function DeliveryBoard({
  org,
  contractId,
  deliveryId,
  code,
  voided,
  canVoid,
  date,
  listName,
  receivedBy,
  notes,
  facts,
  lines,
  photos,
}: {
  org: string;
  contractId: string;
  deliveryId: string;
  code: string;
  voided: boolean;
  canVoid: boolean;
  date: string;
  listName: string;
  receivedBy: string;
  notes: string;
  // Datos del activo de la lista (tipo, marca, modelo, serie…), solo los que tienen valor.
  facts: [string, string][];
  lines: DeliveryLine[];
  photos: DeliveryPhoto[];
}) {
  const [tab, setTab] = useState<Tab>("lines");
  return (
    <>
      <FolderTabs
        label="Contenido de la entrega"
        tabs={[
          { key: "lines", label: "Líneas", count: lines.length },
          { key: "photos", label: "Fotografías", count: photos.length },
        ]}
        activeKey={tab}
        onSelect={(key) => setTab(key as Tab)}
        trailing={canVoid ? <VoidDelivery org={org} contractId={contractId} deliveryId={deliveryId} code={code} /> : undefined}
      />

      {/* Datos de la entrega: una franja, como la del activo de la lista en Abastecimiento. */}
      <div className="border-b">
        <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 px-6 py-3">
          <Fact label="Estado">
            <Badge variant={voided ? "destructive" : "solid-stock"}>{voided ? "Anulada" : "Entregada"}</Badge>
          </Fact>
          <Fact label="Fecha"><span className="num">{formatIso(date)}</span></Fact>
          <Fact label="Lista">{listName}</Fact>
          <Fact label="Recibe">{receivedBy || "—"}</Fact>
          {canVoid && (
            <div className="-mr-2 ml-auto">
              <EditDelivery org={org} contractId={contractId} deliveryId={deliveryId} code={code} date={date} receivedBy={receivedBy} notes={notes} />
            </div>
          )}
        </dl>
        {notes && (
          <p className="border-t px-6 py-3 text-sm">
            <span className="caps mr-3 text-muted-foreground">Notas</span>
            <span className="whitespace-pre-wrap">{notes}</span>
          </p>
        )}
        {facts.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-1.5 border-t px-6 py-3 text-xs">
            {facts.map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {tab === "lines" ? (
        lines.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Esta entrega no tiene líneas.</p>
        ) : (
          <DeliveryLines lines={lines} />
        )
      ) : (
        <>
          {!voided && <p className="px-6 pt-4 text-sm text-muted-foreground">Registro fotográfico de la entrega. Desde el celular puedes usar la cámara.</p>}
          <DeliveryPhotos org={org} contractId={contractId} deliveryId={deliveryId} photos={photos} canEdit={!voided} />
        </>
      )}
    </>
  );
}
