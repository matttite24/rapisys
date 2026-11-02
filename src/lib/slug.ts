// Rutas de primer nivel que una organización no puede usar como slug.
const RESERVED = new Set(["login", "signup", "auth", "onboarding", "invitacion", "api"]);

export function slugify(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base && !RESERVED.has(base) ? base : `org-${base || "nueva"}`.replace(/-$/, "");
}

export function withSuffix(slug: string) {
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}
