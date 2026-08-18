"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";

interface OrderPixSectionProps {
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
}

export function OrderPixSection({
  status,
  qrCode,
  qrCodeBase64,
}: OrderPixSectionProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // Poll server state every 5 seconds while payment status is PENDING
  useEffect(() => {
    if (status !== "PENDING") return;

    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [status, router]);

  const handleCopy = async () => {
    if (!qrCode) return;

    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("[PIX_COPY_ERROR]", err);
    }
  };

  if (status !== "PENDING") return null;

  return (
    <div className="mt-6 border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-6">
      <div className="text-center max-w-md mx-auto space-y-4">
        <h3 className="text-lg font-extrabold text-amber-900 dark:text-amber-200">
          Pagamento via Pix
        </h3>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Escaneie o QR Code abaixo com o aplicativo do seu banco para finalizar
          a compra:
        </p>

        {/* QR Code Image Display */}
        {qrCodeBase64 && (
          <div className="flex justify-center my-4">
            <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-sm">
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="Pix QR Code"
                className="w-52 h-52 object-contain"
              />
            </div>
          </div>
        )}

        {/* Copy-and-Paste Pix Code */}
        {qrCode && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Ou copie o código Pix abaixo:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={qrCode}
                className="w-full text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-600 dark:text-zinc-300 truncate focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-center gap-2 text-xs text-amber-700 dark:text-amber-400 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          Aguardando confirmação do pagamento em tempo real...
        </div>
      </div>
    </div>
  );
}
