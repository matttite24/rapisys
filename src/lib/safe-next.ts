// Destino de redirección tras iniciar sesión: solo rutas internas.
// Rechaza "//" y "\": el navegador lee "/\evil.com" como "//evil.com" (otro sitio).
export function safeNext(value: unknown, fallback = "/") {
  const next = typeof value === "string" ? value : "";
  const internal =
    next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !/[\u0000-\u001f]/.test(next);
  return internal ? next : fallback;
}
