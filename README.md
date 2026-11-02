# Rapisys

Gestión de contratos de compra y venta de repuestos automotrices, por organización:
contratos con líneas y fases, bodega (items, proveedores, activos), clientes,
responsables y miembros con roles.

**Stack:** Next.js 16 (App Router, Cache Components) · Supabase (Auth, Postgres con RLS) ·
shadcn con Base UI · Hugeicons · DM Sans / DM Mono.

## Puesta en marcha

1. Instala dependencias: `npm install`
2. Crea `.env.local` con el proyecto de Supabase:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Aplica las migraciones de `supabase/migrations/` **en orden** (SQL Editor de Supabase).
4. En Supabase → Authentication → URL Configuration: Site URL `http://localhost:3000` y,
   en Redirect URLs, `http://localhost:3000/auth/callback**`.
5. `npm run dev` y abre <http://localhost:3000>. El primer usuario crea la organización;
   el resto entra por invitación (Ajustes → Miembros).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Construcción de producción |
| `npm test` | Pruebas (Vitest) |
| `npm run lint` | ESLint |
| `npm run ui:add -- <componente>` | Agrega un componente de shadcn sin sobrescribir y corrige su import de `cn` |

## Reglas del proyecto

- **Todo es por organización.** Cada tabla de negocio lleva `organization_id` y RLS con
  `is_member` / `has_role`. Las rutas viven bajo `/[org]/…`. Para comprobar el aislamiento,
  ejecuta `supabase/tests/isolation.sql` en el SQL Editor.
- **El dinero va en centavos enteros** ($10 = 1000) en la base (`*_cents`, `bigint`) y en el
  código. Todo cálculo, lectura y formato está en `src/lib/money.ts`; no se opera con decimales.
- **Listados paginados** (`src/lib/pagination.ts`): nunca se carga una tabla completa.
- **Estilo:** celdas de borde a borde, botones y etiquetas en DM Mono. Los ajustes de shadcn
  están en `src/app/globals.css` (no se editan los archivos de `components/ui/`).
- **Páginas dinámicas:** los componentes que leen la sesión llaman `await connection()` antes
  de crear el cliente de Supabase.
