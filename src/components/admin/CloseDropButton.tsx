"use client";

import { useTransition } from "react";
import { closeDropSales } from "@/actions/drop.actions";

interface CloseDropButtonProps {
  dropId: string;
  isClosed: boolean;
}

export function CloseDropButton({ dropId, isClosed }: CloseDropButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (isClosed) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400">
        Vendas Encerradas
      </span>
    );
  }

  const handleClose = () => {
    if (
      confirm(
        "Tem certeza que deseja encerrar as vendas deste Drop imediatamente?",
      )
    ) {
      startTransition(async () => {
        await closeDropSales(dropId);
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClose}
      disabled={isPending}
      className="rounded-md bg-red-600/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-600/20 transition-colors disabled:opacity-50"
    >
      {isPending ? "Encerrando..." : "Encerrar Vendas Agora"}
    </button>
  );
}
