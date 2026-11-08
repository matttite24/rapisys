# Carga de facturas desde el XML del SRI: plan

Objetivo: en **Compras › Subir factura**, cargar el XML de una factura electrónica del SRI y que el formulario
quede lleno (proveedor, número, fecha y líneas), para revisar, asignar a líneas del contrato y guardar.
La carga **no guarda nada sola**: rellena el mismo formulario que hoy se llena a mano.

## 1. Qué trae el XML

Hay dos formas de recibirlo, las dos deben funcionar:

1. **Comprobante solo:** raíz `<factura id="comprobante" version="1.x.0">`.
2. **Autorizado** (el que se descarga del SRI o llega por correo): raíz `<autorizacion>` con el comprobante dentro
   de `<comprobante><![CDATA[ <factura>…</factura> ]]></comprobante>`. Hay que sacarlo del CDATA y volver a leerlo.
   Este trae además `numeroAutorizacion` y `fechaAutorizacion`.

Campos que usamos de la factura:

| Dónde | Campo | Lo usamos para |
|---|---|---|
| `infoTributaria` | `ruc`, `razonSocial`, `nombreComercial` | Identificar al **proveedor** |
| `infoTributaria` | `estab` + `ptoEmi` + `secuencial` | **N.º de factura** `001-001-000123456` |
| `infoTributaria` | `claveAcceso` (49 dígitos) | Identificar la factura sin ambigüedad (evita cargarla dos veces) |
| `infoFactura` | `fechaEmision` (`dd/mm/aaaa`) | **Fecha** |
| `infoFactura` | `identificacionComprador` | Comprobar que es **para nuestra organización** |
| `infoFactura` | `totalSinImpuestos`, `importeTotal`, `totalConImpuestos` | **Cuadre** contra lo que calculamos |
| `detalles/detalle` | `codigoPrincipal`, `codigoAuxiliar` | Encontrar el **producto** |
| `detalles/detalle` | `descripcion`, `cantidad`, `precioUnitario`, `descuento`, `precioTotalSinImpuesto` | Línea de la factura |
| `detalle/impuestos/impuesto` con `codigo = 2` | `codigoPorcentaje`, `tarifa` | **IVA %** de la línea |

IVA (`codigoPorcentaje`, a confirmar con la ficha técnica vigente del SRI): 0 → 0 %, 2 → 12 %, 3 → 14 %,
4 → 15 %, 5 → 5 %, 10 → 13 %; 6 = no objeto de IVA y 7 = exento (ambos 0 %). Se usa `tarifa` cuando viene.

### Lo que mostraron los dos XML de ejemplo (`docs/Factura.xml`, `docs/Factura-2.xml`)

| | Factura.xml (Kabelmorante) | Factura-2.xml (Inverneg, autorizada) |
|---|---|---|
| Formato | Comprobante solo, con sangría | `<autorizacion>` + CDATA, una sola línea (74 KB) |
| Líneas | 16 | 142 |
| `codigoPrincipal` | **No trae** en ninguna línea | Siempre; **se repite en varias líneas** |
| Descuento por línea | No | 7 líneas |
| IVA | 0 % y 15 % mezclados (códigos 0 y 4) | Solo 15 % |
| Líneas de 1 centavo | No | Sí (`0.01`, precio simbólico) |

Consecuencias:
- **Sin código no hay emparejamiento por código** (Factura.xml): hay que caer a la descripción. La revisión debe poder
  elegir producto a mano en todas las líneas, no solo en las "no encontradas".
- **Un mismo código en varias líneas** (Factura-2): no se fusionan; cada línea del XML es una línea de la factura.
- **`precioUnitario` trae 3-4 decimales** y `cantidad × precioUnitario` no da `precioTotalSinImpuesto` (21 de 142 líneas
  difieren por redondeo). Confirma usar el total de la línea ÷ cantidad, nunca el unitario.
- `cantidad` puede venir como `1.0000`: leer como número.
- La suma de las líneas sí cuadra con `totalSinImpuestos` en ambas (448.22 y 16 797.93). IVA por línea y por tasa también.

## 2. De XML a nuestro modelo

```
infoTributaria.ruc               → proveedor (suppliers.ruc), si no existe se ofrece crearlo
estab-ptoEmi-secuencial          → purchases.number
fechaEmision                     → purchases.purchased_on
detalle.codigoPrincipal/Auxiliar → items.sku / items.part_numbers  (productos de la bodega)
detalle.cantidad                 → purchase_lines.quantity
detalle.precioTotalSinImpuesto
   ÷ cantidad                    → purchase_lines.unit_cost_cents   (ya con el descuento aplicado)
impuesto.tarifa                  → purchase_lines.vat_rate
```

Costo con descuento: `precioTotalSinImpuesto / cantidad`, no `precioUnitario`, para que el subtotal cuadre con la
factura aunque tenga descuentos por línea.

## 3. Flujo

1. En **Subir factura**, junto a "Cancelar" y "Guardar", un botón **Cargar XML** (o arrastrar el archivo sobre el
   formulario). Acepta uno o varios, pero se revisa de a uno.
2. Se lee **en el navegador** (sin subir nada al servidor todavía): se extrae el comprobante, se valida y se llena el
   formulario.
3. Sobre las líneas aparece una **barra de revisión** con lo que hay que resolver:
   - Proveedor: encontrado por RUC, o "No existe: crear con estos datos".
   - **N líneas sin producto en la bodega** (código no encontrado): cada una se marca y ofrece *Elegir producto* o
     *Crear producto* con descripción y código ya rellenados.
   - **Cuadre:** "Subtotal XML $X · calculado $X ✓" o la diferencia.
   - Aviso si el comprador no es la organización.
4. **Propuesta de asignación:** para cada línea, si su código coincide con una línea pendiente del contrato, se
   propone asignarla (con las unidades que faltan). La persona la acepta o la quita; nada se asigna sin que se vea.
5. **Guardar** crea la factura como hoy (`createPurchase`).

## 4. Reglas y validaciones

- **No se carga dos veces:** nueva columna `purchases.access_key` (clave de acceso) con índice único por organización.
  Si ya existe, se muestra "Esta factura ya está cargada en [contrato]" con enlace.
- Solo facturas (`codDoc = 01`). Notas de crédito, retenciones, guías y liquidaciones se rechazan con un mensaje claro.
- **Cuadre de totales** contra `totalSinImpuestos` e `importeTotal`, con tolerancia de centavos por redondeo.
- Si el comprador no coincide con el RUC de la organización: **advertencia**, no bloqueo (a veces se factura a un
  tercero). Hoy la organización no guarda RUC; se agregaría `organizations.ruc` en Ajustes.
- Archivo: máximo 2 MB; se rechaza si no es XML.

## 5. Seguridad del archivo

Es un archivo externo, se trata como datos: se lee con `DOMParser` (no resuelve entidades externas), se limita el
tamaño y el número de líneas (1.000), y todo texto se pasa por `textContent` y se recorta. Nunca se muestra como HTML.
El XML original se guarda como adjunto de la factura cuando exista el módulo **Archivos** (Storage).

## 6. Dónde va el código

- `src/lib/sri-xml.ts`: lector puro. Entrada: texto del XML. Salida: `{ supplier, number, date, accessKey, buyerRuc,
  totals, lines[] }` o un error con motivo. Sin dependencias; con pruebas (jsdom) sobre XML de ejemplo.
- `src/lib/purchase-actions.ts`: `matchXmlLines(org, contractId, lines)`: busca productos por código y propone
  asignaciones en una sola llamada (consulta por lotes, no una por línea).
- `purchase-form.tsx`: botón **Cargar XML**, barra de revisión y relleno del estado de las filas.
- Migración: `purchases.access_key` (+ índice único) y `organizations.ruc`.

## 7. Etapas

1. **Lector del XML y pruebas** con facturas reales (ambos formatos, con y sin descuento, varias tarifas de IVA).
2. **Carga al formulario:** proveedor, número, fecha, líneas con producto encontrado y cuadre de totales.
3. **Productos y proveedores nuevos:** crear desde la revisión, y elegir entre varios que coincidan.
4. **Propuesta de asignación** a líneas del contrato.
5. **Duplicados** (`access_key`) y **RUC de la organización**.
6. **Adjuntar el XML** a la factura (con el módulo Archivos).

## 8. Decisiones

**Resueltas**
- **Producto no encontrado:** se crea desde la revisión, línea por línea (con descripción y código ya rellenados), o se
  elige uno existente.
- **Precisión:** se guardan centavos. El **subtotal de cada línea del XML manda** y el costo unitario se redondea a
  centavos; los totales de la factura cuadran con el XML.
- **Proveedor no encontrado por RUC:** se crea desde la revisión con la razón social y el RUC del XML.

**Pendientes**
0. **La precisión en centavos no basta (hallazgo con Factura-2).** Si el costo unitario se guarda redondeado a centavos
   (`unit_cost_cents` entero), `costo × cantidad` ya no da el subtotal del XML: en Factura-2 la suma queda en
   **16 797.73 vs 16 797.93** (-$0.20), y en una línea de 329 unidades el error llega a ~$1.6. La decisión "el subtotal
   del XML manda" no se puede cumplir con solo `unit_cost_cents`. Opciones:
   a) guardar también el subtotal de la línea (`line_total_cents`) y usarlo para totales;
   b) ampliar la precisión del costo (p. ej. `unit_cost_micros`), con migración y cambios en kardex/lotes;
   c) aceptar la diferencia y mostrarla en el cuadre como "redondeo".
   Recomendado **a**: mínimo cambio, y el cuadre con el SRI queda exacto. Hay que decidirlo antes de la etapa 2.
1. **Códigos del proveedor:** `codigoPrincipal` es el código del proveedor, no el nuestro. ¿Se guarda ese código en el
   producto (como número de parte alterno) al emparejar por primera vez, para que la siguiente factura lo encuentre
   sola? Recomendado: sí.
2. ~~Hace falta un XML real~~: ya hay dos (`docs/`). Sirven de pruebas de la etapa 1; falta uno con IVA 5 %/exento
   si se quiere cubrir esos códigos.
3. **Emparejar sin código** (Factura.xml): ¿solo por descripción exacta/aproximada con sugerencias, o siempre manual
   la primera vez y se guarda la descripción del proveedor como alias? Recomendado: sugerencias por descripción y
   guardar el alias al confirmar.
