"use client";

import NextLink from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, type ComponentProps } from "react";

type Handler = (href: string) => boolean;
const Context = createContext<{ register: (handler: Handler) => () => void; navigate: (href: string) => boolean }>({ register: () => () => {}, navigate: () => false });
export function ListFilterNavigationProvider({ children }: { children: React.ReactNode }) {
  const handler = useRef<Handler | null>(null);
  const value = useMemo(() => ({
    register(next: Handler) { handler.current = next; return () => { if (handler.current === next) handler.current = null; }; },
    navigate(href: string) { return handler.current?.(href) ?? false; },
  }), []);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useListFilterNavigation(handler: Handler) {
  const context = useContext(Context);
  useEffect(() => context.register(handler), [context, handler]);
}
export function ListFilterLink({ href, onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  const context = useContext(Context);
  return <NextLink {...props} href={href} onNavigate={(event) => {
    if (typeof href === "string" && context.navigate(href)) event.preventDefault();
    else onNavigate?.(event);
  }} />;
}
