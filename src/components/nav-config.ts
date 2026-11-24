import type { IconSvgElement } from "@hugeicons/react";
import {
  AddressBookIcon,
  AddSquareIcon,
  BankIcon,
  Building03Icon,
  CheckmarkCircle02Icon,
  Car01Icon,
  CreditCardIcon,
  ContractsIcon,
  DeliveryTruck01Icon,
  File01Icon,
  Analytics01Icon,
  Folder01Icon,
  LeftToRightListBulletIcon,
  Package01Icon,
  PackageProcessIcon,
  PlayCircleIcon,
  Settings02Icon,
  ShoppingCart01Icon,
  BriefcaseBusinessIcon,
  UserCheck01Icon,
  UserGroupIcon,
  Wallet01Icon,
  WarehouseIcon,
} from "@hugeicons/core-free-icons";

export type NavItem = { title: string; href: string; icon?: IconSvgElement; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };
export type NavModule = {
  title: string;
  label?: string; // texto corto para el menú principal
  href: string; // ruta base: define el módulo activo
  icon: IconSvgElement;
  groups: NavGroup[];
  bottom?: boolean; // se muestra al final de la columna de módulos
};

// Primera columna = módulos; segunda columna = grupos del módulo activo.
export const modules: NavModule[] = [
  {
    title: "Procesos",
    href: "/contratos",
    icon: ContractsIcon,
    groups: [
      {
        items: [
          { title: "Todos", href: "/contratos", icon: File01Icon },
          { title: "Nuevos", href: "/contratos?estado=nuevos", icon: AddSquareIcon },
          { title: "En ejecución", href: "/contratos?estado=ejecucion", icon: PlayCircleIcon },
          { title: "Por cobrar", href: "/contratos?estado=cierre", icon: Wallet01Icon },
          { title: "Cobrados", href: "/contratos?estado=cobrados", icon: CheckmarkCircle02Icon },
        ],
      },
      {
        items: [
          { title: "Crédito", href: "/contratos?estado=credito", icon: CreditCardIcon },
        ],
      },
    ],
  },
  {
    title: "Bodega",
    href: "/bodega",
    icon: WarehouseIcon,
    groups: [
      {
        items: [
          { title: "Items", href: "/bodega", icon: Package01Icon },
          { title: "Activos", href: "/bodega?vista=activos", icon: Car01Icon },
        ],
      },
    ],
  },
  {
    title: "Directorio",
    href: "/directorio",
    icon: AddressBookIcon,
    groups: [
      { items: [
        { title: "Todos los clientes", href: "/directorio", icon: UserGroupIcon },
        { title: "Empresas", href: "/directorio?tipo=company", icon: BriefcaseBusinessIcon },
        { title: "Instituciones", href: "/directorio?tipo=institution", icon: Building03Icon },
        { title: "Personas", href: "/directorio?tipo=person", icon: UserGroupIcon },
      ] },
      { items: [
        { title: "Responsables de contrato", href: "/directorio?grupo=responsables", icon: UserCheck01Icon },
      ] },
    ],
  },
  {
    title: "Proveedores",
    href: "/proveedores",
    icon: BriefcaseBusinessIcon,
    groups: [{ items: [{ title: "Listado", href: "/proveedores", icon: BriefcaseBusinessIcon }] }],
  },
  {
    title: "Bancos",
    href: "/bancos",
    icon: BankIcon,
    groups: [{ items: [{ title: "Cuentas", href: "/bancos", icon: BankIcon }] }],
  },
  {
    title: "Ajustes",
    href: "/ajustes",
    icon: Settings02Icon,
    bottom: true,
    groups: [
      {
        items: [
          { title: "General", href: "/ajustes", icon: Settings02Icon },
          { title: "Miembros", href: "/ajustes/miembros", icon: UserGroupIcon },
        ],
      },
    ],
  },
];

// Partes de un proceso: la columna de opciones las muestra dentro de un proceso.
// Sección de un proceso según la ruta (sin el prefijo de la organización): /contratos/{id}[/parte].
export function contractSection(path: string) {
  const m = path.match(/^\/contratos\/[0-9a-f-]{36}(?:\/([^/]+))?/i);
  return m ? CONTRACT_SECTIONS.find((s) => s.slug === (m[1] ?? "")) : undefined;
}

// Pantalla dentro de una sección del proceso (compras/nueva, entregas/{id}/documento…), para las migas del encabezado.
export function contractSubsection(path: string): string | undefined {
  const m = path.match(/^\/contratos\/[0-9a-f-]{36}\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/i);
  if (!m) return undefined;
  const [, a, b, c] = m;
  if (a === "gastos") return "Gastos";
  if (!b) return undefined;
  if (b === "nueva") return "Nueva";
  if (a === "compras") return c === "editar" ? "Editar" : "Factura";
  if (a === "entregas") return c === "documento" ? "Documento" : "Entrega";
  return undefined;
}

export const CONTRACT_SECTIONS = [
  { slug: "", title: "Detalle", icon: File01Icon },
  { slug: "items", title: "Listas", icon: LeftToRightListBulletIcon },
  { slug: "compras", title: "Compras", icon: ShoppingCart01Icon },
  { slug: "abastecimiento", title: "Abastecimiento", icon: PackageProcessIcon },
  { slug: "entregas", title: "Entregas", icon: DeliveryTruck01Icon },
  { slug: "pagos", title: "Pagos", icon: Wallet01Icon },
  { slug: "revision", title: "Revisión", icon: Analytics01Icon },
  { slug: "archivos", title: "Archivos", icon: Folder01Icon },
] as const;
