import { Upload01Icon } from "@hugeicons/core-free-icons";
import { ComingSoon } from "@/components/coming-soon";
import { HeaderAction } from "@/components/header-action";

export default function Page() {
  return (
    <>
      <HeaderAction icon={Upload01Icon} label="Cargar" disabled title="Próximamente" />
      <ComingSoon title="Archivos">Aquí se guardan los documentos del contrato: facturas, notas de entrega y fotos.</ComingSoon>
    </>
  );
}
