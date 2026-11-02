// Sin dependencias de servidor: se puede importar desde componentes de cliente.
export type Role = "admin" | "operator";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operador",
};
