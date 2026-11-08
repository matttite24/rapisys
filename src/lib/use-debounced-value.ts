"use client";

import { useEffect, useState } from "react";

// El valor, pero solo después de que deje de cambiar durante `delay` ms. Sirve para filtrar listas largas en el
// navegador sin rehacerlas en cada tecla.
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
