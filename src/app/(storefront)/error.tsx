"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StorefrontError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Storefront Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] bg-zinc-50 px-6 py-16 text-zinc-900 flex items-center justify-center">
      <div className="mx-auto max-w-xl w-full border-4 border-black bg-white p-8 shadow-[10px_10px_0px_#f97316]">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-orange-500">
          ERRO DO SISTEMA
        </p>
        
        <h1 className="mt-4 text-4xl font-black uppercase leading-tight tracking-tight">
          Oops! Algo quebrou no caminho.
        </h1>

        <p className="mt-4 text-zinc-600 font-medium">
          Não conseguimos carregar essa seção da loja. Pode ser uma oscilação na conexão ou um imprevisto técnico.
        </p>

        {error.message && (
          <div className="mt-6 border-2 border-black bg-zinc-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Detalhes do erro:</p>
            <code className="block text-sm font-mono break-all text-red-600">
              {error.message}
            </code>
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => reset()}
            className="
              flex-1
              border-2
              border-black
              bg-orange-500
              px-6
              py-3
              text-center
              font-black
              uppercase
              tracking-wider
              text-white
              transition-transform
              hover:-translate-y-1
              hover:shadow-[4px_4px_0px_#000]
              active:translate-y-0
              active:shadow-none
              cursor-pointer
            "
          >
            Tentar novamente
          </button>
          
          <Link
            href="/"
            className="
              flex-1
              border-2
              border-black
              bg-white
              px-6
              py-3
              text-center
              font-black
              uppercase
              tracking-wider
              transition-transform
              hover:-translate-y-1
              hover:shadow-[4px_4px_0px_#000]
              active:translate-y-0
              active:shadow-none
            "
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}