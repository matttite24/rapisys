"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Búsqueda que escribe la persona: espera a que pare de teclear (`delay` ms), cancela la anterior y
// descarta respuestas atrasadas, así una consulta lenta nunca pisa a una más nueva.
// `run(texto, 0)` busca de inmediato (p. ej. al abrir).
export function useDebouncedSearch<T>(fetcher: (q: string) => Promise<T>, delay = 300) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  const latest = useRef(fetcher);
  const [results, setResults] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latest.current = fetcher;
  });

  const run = useCallback(
    (q: string, wait = delay) => {
      clearTimeout(timer.current);
      const id = ++seq.current;
      setLoading(true);
      setError(null);
      timer.current = setTimeout(async () => {
        try {
          const r = await latest.current(q);
          if (id === seq.current) setResults(r);
        } catch {
          if (id === seq.current) { setResults(null); setError("No se pudo completar la búsqueda. Inténtalo de nuevo."); }
        } finally {
          if (id === seq.current) setLoading(false);
        }
      }, wait);
    },
    [delay],
  );

  // Cierra la lista y descarta lo que esté en vuelo.
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    seq.current++;
    setResults(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      seq.current++;
    },
    [],
  );

  return { results, loading, error, run, clear };
}
