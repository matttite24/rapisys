// Quita lo que rompería un filtro `.or()` de PostgREST (comas, paréntesis, comodines, comillas).
export const cleanSearch = (q: string) => q.replace(/[,()%*{}"\\]/g, " ").trim();
