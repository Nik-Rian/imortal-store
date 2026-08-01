"use client";

import { useState, useTransition } from "react";
import { deleteAdminUser } from "@/actions/user.actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UserMinusIcon, CircleNotchIcon } from "@phosphor-icons/react";

interface DeleteUserButtonProps {
  userId: string;
  userName?: string;
}

export function DeleteUserButton({ userId, userName }: DeleteUserButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAdminUser(userId);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível remover o usuário."
        );
      }
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
              title="Remover usuário"
            >
              <UserMinusIcon className="size-4" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remover Administrador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o usuário{" "}
              {userName ? <strong className="text-foreground">{userName}</strong> : "selecionado"} do painel administrativo? Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Remover Usuário"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


