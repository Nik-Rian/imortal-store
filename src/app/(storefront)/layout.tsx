import { Header } from "@/components/layout/Header";
import { CartProvider } from "@/context/CartContext";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <Header />
      <main className="flex-1">{children}</main>
    </CartProvider>
  );
}
