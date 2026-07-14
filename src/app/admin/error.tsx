"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Admin Dashboard Error Boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-lg space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="rounded-full bg-red-100 p-2 text-red-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">Erro no Painel Administrativo</h2>
            <p className="text-xs text-zinc-500">Ocorreu uma falha ao processar a requisição.</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-zinc-600">
            A ação solicitada não pôde ser concluída. Verifique suas credenciais, certifique-se de que os campos requeridos estão corretos ou tente reiniciar o processo.
          </p>
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Mensagem de Erro
            </span>
            <code className="text-sm font-mono text-red-600 wrap-break-words block">
              {error.message || "Instabilidade ou erro interno desconhecido."}
            </code>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors cursor-pointer"
          >
            Tentar Novamente
          </button>
          
          <Link
            href="/admin"
            className="flex-1 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 h-10 px-4 py-2 transition-colors"
          >
            Ir para a Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}