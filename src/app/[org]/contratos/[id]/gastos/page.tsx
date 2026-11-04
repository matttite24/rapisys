import { Add01Icon } from "@hugeicons/core-free-icons";
import { ComingSoon } from "@/components/coming-soon";
import { HeaderAction } from "@/components/header-action";

export default function Page() {
  return (
    <>
      <HeaderAction icon={Add01Icon} label="Registrar" disabled title="Próximamente" />
      <ComingSoon title="Gastos">Aquí se ingresan los gastos del contrato: alimentación, transporte y otros, con su documento y método de pago.</ComingSoon>
    </>
  );
}
