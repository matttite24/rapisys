import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No ejecutar lógica entre createServerClient y getClaims().
  // getClaims verifica la firma del token en el servidor, sin ir a Supabase en cada navegación
  // (renueva la sesión si venció). Solo decide a dónde ir; los datos los protege RLS.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isPublic = isAuthPage || pathname.startsWith("/auth/");

  if (!user && !isPublic) {
    // Conserva el destino (p. ej. una invitación) para volver tras iniciar sesión.
    const next = pathname === "/" ? undefined : pathname + request.nextUrl.search;
    return redirectWithCookies(request, response, "/login", next);
  }
  if (user && isAuthPage) {
    return redirectWithCookies(request, response, "/");
  }

  return response;
}

// Conserva las cookies de sesión refrescadas al redirigir.
function redirectWithCookies(
  request: NextRequest,
  from: NextResponse,
  path: string,
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = next ? `?next=${encodeURIComponent(next)}` : "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
