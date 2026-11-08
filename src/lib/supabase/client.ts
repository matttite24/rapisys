import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador: solo para subir archivos con una URL firmada que prepara el servidor.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
