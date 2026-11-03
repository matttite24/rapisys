import type { IconSvgElement } from "@hugeicons/react";
import {
  Building03Icon,
  Car01Icon,
  ContractsIcon,
  DashboardSquare01Icon,
  DeliveryTruck01Icon,
  File01Icon,
  Folder01Icon,
  Package01Icon,
  PackageProcessIcon,
  PlayCircleIcon,
  Settings02Icon,
  ShoppingCart01Icon,
  UserCheck01Icon,
  UserGroupIcon,
  Wallet01Icon,
  WarehouseIcon,
} from "@hugeicons/core-free-icons";

export type NavItem = { title: string; href: string; icon?: IconSvgElement };
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
    title: "Inicio",
    href: "/inicio",
    icon: DashboardSquare01Icon,
    groups: [{ items: [{ title: "Resumen", href: "/inicio", icon: DashboardSquare01Icon }] }],
  },
  {
    title: "Contratos",
    href: "/contratos",
    icon: ContractsIcon,
    groups: [
      {
        items: [
          { title: "Todos los contratos", href: "/contratos", icon: File01Icon },
          { title: "En ejecución", href: "/contratos/ejecucion", icon: PlayCircleIcon },
          { title: "Cierre y cobro", href: "/contratos/cierre", icon: Wallet01Icon },
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
          { title: "Activos", href: "/bodega/activos", icon: Car01Icon },
        ],
      },
    ],
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Building03Icon,
    groups: [{ items: [{ title: "Instituciones", href: "/clientes", icon: Building03Icon }] }],
  },
  {
    title: "Proveedores",
    href: "/proveedores",
    icon: DeliveryTruck01Icon,
    groups: [{ items: [{ title: "Listado", href: "/proveedores", icon: DeliveryTruck01Icon }] }],
  },
  {
    title: "Responsable de Contrato",
    label: "Responsables",
    href: "/responsables",
    icon: UserCheck01Icon,
    groups: [
      {
        items: [
          { title: "Responsables", href: "/responsables", icon: UserCheck01Icon },
        ],
      },
    ],
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

// Partes de un contrato: la columna de opciones las muestra dentro de un contrato.
export const CONTRACT_SECTIONS = [
  { slug: "", title: "Detalle", icon: File01Icon },
  { slug: "items", title: "Items", icon: Package01Icon },
  { slug: "abastecimiento", title: "Abastecimiento", icon: PackageProcessIcon },
  { slug: "compras", title: "Compras", icon: ShoppingCart01Icon },
  { slug: "gastos", title: "Gastos", icon: Wallet01Icon },
  { slug: "archivos", title: "Archivos", icon: Folder01Icon },
] as const;
