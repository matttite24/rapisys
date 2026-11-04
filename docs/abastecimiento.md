# Abastecimiento: plan

> **Avance:** hechas la etapa 1 (existencias por lote), la 2 (reservar desde la bodega), el **reporte de
> entrega** (entregas parciales de lo que ya tiene stock) y la 3 (compras: facturas por contrato,
> asignadas a líneas de la lista). La factura queda sin adjunto: los archivos se hacen con el módulo
> Archivos (Storage).
> Falta: recepción (etapa 4), proforma, listo para entrega, resumen en Detalle y rentabilidad.

Pantalla del contrato donde se va **línea por línea** de la lista de referencia y se resuelve cada
producto, desde la **bodega** o desde **facturas de compra**, hasta dejarlo listo para entrega.

## 1. Cómo funciona en la vida real (base del diseño)

1. A cada contrato se le **van comprando las listas poco a poco**. A veces no se encuentra todo.
2. **Una lista se completa con varias facturas**, y esas facturas son de **varios proveedores**.
3. Lo que sobra queda en la **bodega de la organización**, disponible para otros contratos.
4. Los productos de la bodega **existen aunque tengan 0 en existencia**: la ficha del producto se conserva.

De aquí salen las reglas del diseño:

- **La compra es el flujo principal**, no la excepción. Una línea del contrato se cubre con **varias**
  líneas de factura, de distintos proveedores y fechas, y también con existencias de la bodega.
- **Todo lo comprado entra primero a la bodega** (con el proveedor y el costo de esa compra) y de ahí se
  **reserva** para el contrato. Así el sobrante no necesita tratamiento especial: es lo que queda en
  existencia, y **se usa en otro contrato sin volver a cargar la factura**.
- **Una factura es de un solo contrato.** Lo que sobra no se re-factura: ya está en la bodega.
- **El costo depende del proveedor.** Un producto tiene varios proveedores y cada uno su costo. Las
  existencias recuerdan de qué compra (proveedor y costo) vienen.
- **El producto y su stock son cosas distintas.** El stock se calcula con movimientos y puede ser 0; el
  producto sigue ahí. Una factura puede traer un producto nuevo: se crea en la bodega con 0 y la
  recepción lo sube.

## 2. Qué hay hoy (y qué falta)

| Pieza | Estado |
|---|---|
| Lista de referencia por activo (`contract_lists`, `contract_items`) | Hecho |
| Catálogo de la bodega (`items`): SKU, hasta 3 números de parte, margen %, costos por proveedor (`item_supplier_prices`) | Hecho. Ya permite productos sin existencias |
| Proveedores (`suppliers`) | Hecho |
| `contract_items.phase` y `received_qty` | **Heredados** de un diseño anterior: se reemplazan |
| **Existencias de la bodega** | **No existe.** Es la base de todo |
| Compras (facturas) y sus líneas | No existe |
| Gastos, Archivos | Pantallas vacías |

## 3. Estados

```
Pendiente → Proformado → Comprado → Recibido X de N → En stock completo → Listo para entrega
```

| Estado | Significa | Cómo se llega |
|---|---|---|
| Pendiente | Unidades sin producto asociado ni compra | Estado inicial |
| Proformado | Hay un precio cotizado por un proveedor | Registrar la proforma (proveedor, costo, vigencia) |
| Comprado | Hay una línea de factura asignada | Asignar una línea de compra a la línea del contrato |
| Recibido X de N | Llegó parte de lo comprado | Recepción parcial |
| En stock completo | Todas las unidades están en bodega, reservadas para este contrato | Recepción completa, **o** reserva directa de existencias |
| Listo para entrega | Revisado y preparado para despachar | Confirmación manual |

**El estado se cuenta por unidades, porque una línea se completa de a poco.** Ejemplo: se piden 10.
4 se reservaron de la bodega, 3 se compraron en una factura y 3 aún no se consiguen.

- Cada unidad está en un estado (pendiente, proformada, comprada, en stock, lista).
- La línea muestra una **barra segmentada** con ese reparto y el estado del tramo menos avanzado.
  Aquí: "Pendiente", con 3 de 10 sin conseguir.
- "Recibido X de N" cuenta, sobre lo comprado, lo que ya llegó.
- Solo "Listo para entrega" se confirma a mano, y solo cuando la línea está en stock completo.

Un producto que ya está en bodega se reserva y salta directo a "En stock completo".

## 4. Modelo de datos

El stock se lleva **por lote**: un lote es lo que entró en una recepción, con su proveedor y su costo.
El stock de un producto es la suma de lo que queda en sus lotes (puede ser 0).

```
stock_lots               lo que entró a la bodega en una recepción
  item_id, supplier_id?, unit_cost_cents, received_qty, remaining_qty,
  purchase_line_id? (de qué factura vino) , kind: compra | ajuste, created_at

stock_movements          libro (auditoría): entradas, reservas, liberaciones y ajustes
  lot_id, quantity (+ / −), kind, contract_item_id?, created_by, created_at

purchases                factura de proveedor, de UN contrato
  contract_id, supplier_id, number, date, file (Storage), totales en centavos
purchase_lines
  purchase_id, item_id (de la bodega), quantity, unit_cost_cents, vat_rate, received_qty

supply_sources           de dónde sale cada tramo de una línea del contrato (varias por línea)
  contract_item_id, item_id, quantity,
  kind: bodega (reserva de un lote) | compra (línea de factura aún sin recibir) | proforma,
  lot_id?, purchase_line_id?, supplier_id?, quoted_cost_cents?, quote_valid_until?

contract_item_ready      "Listo para entrega" (quién y cuándo)
supply_events            historial de cambios de estado (auditoría)
```

- Todo en **centavos enteros**, RLS por organización.
- Cada transición (reservar, asignar compra, recibir, liberar) es una **función SQL transaccional** con
  bloqueo de fila, para que dos personas no reserven las mismas existencias.
- Una vista (`contract_item_supply`) devuelve por línea el reparto de unidades, el estado y el costo.
  La pantalla la lee por páginas, en una sola llamada, como Items.
- Se retiran `phase` y `received_qty` de `contract_items` cuando la vista los reemplace.
- Los costos por proveedor del producto (`item_supplier_prices`) son la referencia para las **proformas**;
  el costo real de lo comprado sale de la factura.

## 5. Costo (la rentabilidad queda para después)

- Por ahora cada línea muestra su **costo**: el de los lotes que la cubren. Si salen de lotes o
  proveedores distintos, es el promedio ponderado por cantidad, y se ve el detalle por proveedor.
- **Rentabilidad, precio de venta y utilidad frente al monto del contrato: fuera de esta primera
  versión.** La estructura no lo impide: se agregarán sobre los mismos costos.

## 6. Pantallas

**Abastecimiento** (lista abierta, mismas pestañas por activo)
- Barra de resumen: un contador por estado; al pulsarlo filtra la tabla.
- Tabla: N.º, parte, descripción, cantidad, **barra segmentada de avance**, estado, costo.
- Acción por fila: panel lateral con *Bodega* (buscar por número de parte, ver existencias por proveedor y costo, elegir de qué lote reservar),
  *Compra* (elegir líneas de las facturas del contrato) y *Proforma*. Se reparten las unidades entre fuentes.
- Si el producto no existe: crearlo desde la línea, con número de parte y descripción ya rellenados.
- Acciones en lote: marcar "Listo para entrega".

**Compras** (dentro del contrato)
- Lista de facturas del contrato: proveedor, número, fecha, total, estado de recepción.
- Factura nueva: proveedor, número, fecha, archivo adjunto y sus líneas. Cada línea apunta a un producto
  de la bodega (o lo crea) y se **reparte** entre líneas del contrato; lo que no se reparte queda como
  existencia libre.
- Recepción: marcar lo que llegó, total o parcial.
- Desde una línea de la lista de referencia sin cubrir se puede ir a "comprar esto".

Mismas reglas de rendimiento que Items: solo la lista abierta, páginas de 100, búsqueda en el servidor,
esqueleto de carga y una sola llamada a la base.

## 7. Etapas (cada una se entrega y se prueba sola)

1. **Existencias de la bodega.** Libro de movimientos, stock por producto (puede ser 0) en Bodega, ajuste
   manual para el inventario inicial.
2. **Asociar y reservar.** Pantalla de Abastecimiento con estados y barra de avance, buscar producto por
   número de parte, reservar de la bodega (eligiendo el lote) → "En stock completo". Muestra el costo.
3. **Compras.** Facturas con sus líneas, proveedor y archivo adjunto; repartir líneas de factura entre
   líneas del contrato → "Comprado". Varias facturas y proveedores por línea.
4. **Recepción.** Recibir total o parcial → "Recibido X de N"; lo recibido entra a la bodega y se
   reserva → "En stock completo". El sobrante queda como existencia libre.
5. **Proforma.** Cotización por proveedor → "Proformado".
6. **Listo para entrega.** Confirmación manual, individual y en lote, con historial.
7. **Resumen en Detalle.** Avance por estado y costo. Regla para pasar el contrato a Finalizado.
8. **Rentabilidad** (después): margen, precio de venta y utilidad.
9. **Calidad.** Pruebas de la máquina de estados, del costeo y del redondeo; pruebas SQL de aislamiento
   entre organizaciones y de reservas simultáneas.

## 8. Decisiones

**Resueltas**
- Existencias reales, por lote, y productos que pueden tener 0.
- Una línea se cubre con varias fuentes (varias facturas, varios proveedores y bodega).
- Todo pasa por la bodega; el sobrante queda ahí y se usa en otro contrato sin recargar la factura.
- Una factura es de un solo contrato.
- El costo es por proveedor.
- La rentabilidad se ve después.

**Pendientes**
1. **De qué lote se reserva** cuando hay existencias de varios proveedores: ¿el más barato por defecto,
   el más antiguo, o siempre se elige a mano? Recomendado: sugerir el más barato y dejar cambiarlo.
2. **Reposición sin contrato:** ¿se compran productos para la bodega sin contrato? Recomendado: se
   registran como ajuste de entrada en Bodega (con proveedor y costo), no como factura.
3. **Inventario inicial:** las existencias que ya tienes hoy, ¿con qué proveedor y costo se cargan?
   Recomendado: proveedor y costo opcionales en el ajuste.
4. **Listo para entrega:** ¿siempre manual, o automático al llegar a "En stock completo"?
5. **Retrocesos:** ¿se puede liberar una reserva o anular una compra ya recibida? Recomendado: liberar
   reservas sí; anular compras recibidas solo con un ajuste.
6. **Equivalentes:** cuando el contrato pide un número de parte y en bodega hay otra marca equivalente,
   ¿se asocia a mano o se sugiere por coincidencia de número de parte?
7. **Permisos:** ¿el operador puede reservar, comprar y recibir, y solo el administrador anular?
8. **Notas de crédito y devoluciones al proveedor:** ¿entran en esta primera versión? Recomendado: no.
