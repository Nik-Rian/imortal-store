"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { SignOutIcon, CircleNotchIcon } from "@phosphor-icons/react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await authClient.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={isLoading}
      className="w-full justify-start gap-2 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
    >
      {isLoading ? (
        <CircleNotchIcon className="size-4 animate-spin" />
      ) : (
        <SignOutIcon className="size-4" />
      )}
      <span>Sair da Conta</span>
    </Button>
  );
}

