"use client";

import { useState, useTransition } from "react";
import { deleteAdminUser } from "@/actions/user.actions";

export function DeleteUserButton({ userId }: { userId: string }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteAdminUser(userId);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível remover o usuário."
        );
        setIsConfirming(false);
      }
    });
  };

  if (error) {
    return <span className="text-xs text-red-600">{error}</span>;
  }

  if (isConfirming) {
    return (
      <div className="flex animate-in items-center gap-2 duration-200 fade-in">
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
          {isPending ? "Removendo..." : "Certeza?"}
        </span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs font-bold text-red-600 transition-colors hover:text-red-800 disabled:opacity-50"
        >
          Sim
        </button>
        <button
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
          className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-700 disabled:opacity-50"
        >
          Não
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsConfirming(true)}
      className="text-sm font-medium text-red-600 transition-colors hover:text-red-800"
    >
      Remover
    </button>
  );
}
