"use client";

import { useEffect } from "react";
import { initMercadoPago } from "@mercadopago/sdk-react";

export function MercadoPagoInitializer() {
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (publicKey) {
      initMercadoPago(publicKey, { locale: "pt-BR" });
    }
  }, []);

  return null;
}
