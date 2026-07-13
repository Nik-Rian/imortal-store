import { CartProvider } from "@/context/CartContext";
import { Header } from "@/components/layout/Header";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <Header />
      <main className="flex-1">
        {children}
      </main>
    </CartProvider>
  );
}