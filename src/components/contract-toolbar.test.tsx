// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractToolbar } from "./contract-toolbar";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/org/contratos" }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); window.history.replaceState(null, "", "/org/contratos?page=3"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("conserva filtro cambiado durante la espera y vuelve a primera página", async () => {
  render(<ContractToolbar q="" />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "motor" } });
  window.history.pushState(null, "", "/org/contratos?estado=credito&page=3");
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(router.replace).toHaveBeenCalledWith("/org/contratos?estado=credito&q=motor", { scroll: false });
});
