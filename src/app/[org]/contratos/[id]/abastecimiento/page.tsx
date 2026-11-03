import { ComingSoon } from "@/components/coming-soon";

export default function Page() {
  return (
    <ComingSoon title="Abastecimiento">
      Aquí se trabaja cada item de las listas del contrato: se toma de la bodega o de una factura de compra y avanza por
      Pendiente, Proformado, Comprado, Recibido, En stock completo y Listo para entrega.
    </ComingSoon>
  );
}
