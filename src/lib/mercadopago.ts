import crypto from "node:crypto";

interface VerifySignatureOptions {
  xSignatureHeader: string | null;
  xRequestIdHeader: string | null;
  dataId: string | null;
  webhookSecret: string;
}

/**
 * Validates the Mercado Pago webhook signature using HMAC-SHA256.
 *
 * Header format: ts={timestamp},v1={hash}
 * Manifest format: id:{data_id};request-id:{x-request-id};ts:{ts};
 */
export function verifyMercadoPagoSignature({
  xSignatureHeader,
  xRequestIdHeader,
  dataId,
  webhookSecret,
}: VerifySignatureOptions): boolean {
  if (!xSignatureHeader || !xRequestIdHeader || !dataId || !webhookSecret) {
    return false;
  }

  const parts = xSignatureHeader.split(",");
  let ts: string | null = null;
  let hash: string | null = null;

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "ts") ts = value;
    if (key === "v1") hash = value;
  }

  if (!ts || !hash) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestIdHeader};ts:${ts};`;

  try {
    const calculatedHash = crypto
      .createHmac("sha256", webhookSecret)
      .update(manifest)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, "hex"),
      Buffer.from(hash, "hex"),
    );
  } catch (error) {
    console.error("Erro na validação da assinatura do Webhook:", error);
    return false;
  }
}
