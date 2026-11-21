"use client";

import { initMercadoPago } from "@mercadopago/sdk-react";
import { useEffect } from "react";

export function MercadoPagoInitializer() {
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (publicKey) {
      initMercadoPago(publicKey, { locale: "pt-BR" });
    }
  }, []);

  return null;
}
