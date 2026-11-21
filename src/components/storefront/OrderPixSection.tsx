"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h3 className="text-lg font-extrabold text-amber-900 dark:text-amber-200">
          Pagamento via Pix
        </h3>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Escaneie o QR Code abaixo com o aplicativo do seu banco para finalizar
          a compra:
        </p>

        {/* QR Code Image Display */}
        {qrCodeBase64 && (
          <div className="my-4 flex justify-center">
            <div className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm">
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="Pix QR Code"
                className="h-52 w-52 object-contain"
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
                className="w-full truncate rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="flex animate-pulse items-center justify-center gap-2 pt-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-500"></span>
          Aguardando confirmação do pagamento em tempo real...
        </div>
      </div>
    </div>
  );
}
