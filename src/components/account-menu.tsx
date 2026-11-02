"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({ email }: { email?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-10" aria-label="Cuenta" />}
      >
        <HugeiconsIcon icon={UserIcon} className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end">
        {email && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
        )}
        <DropdownMenuItem onClick={() => logout()}>
          <HugeiconsIcon icon={Logout01Icon} /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
