import { ItemsSkeleton } from "@/components/contract-lines";

// Se muestra al instante al entrar a Items: la estructura vacía, mientras llegan los datos.
export default function Loading() {
  return <ItemsSkeleton />;
}
