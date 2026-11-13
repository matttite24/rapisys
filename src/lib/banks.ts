// Cuentas bancarias de la organización.
export const ACCOUNT_TYPES = { checking: "Corriente", savings: "Ahorros" } as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;
export const isAccountType = (v: string): v is AccountType => Object.hasOwn(ACCOUNT_TYPES, v);

export type BankAccount = {
  id: string;
  bank: string;
  account_type: AccountType;
  account_number: string;
  initial_cents: number;
  manager_id: string | null;
};
