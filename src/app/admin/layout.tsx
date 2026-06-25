import Link from "next/link";
import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-zinc-50">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-zinc-900 text-zinc-50 flex flex-col">
        <div className="p-6">
          <Link href="/admin" className="font-bold text-xl tracking-tight hover:text-zinc-300 transition-colors">
            Imortal Admin
          </Link>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <Link 
            href="/admin" 
            className="block px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            Dashboard
          </Link>
          <Link 
            href="/admin/produtos" 
            className="block px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            Produtos
          </Link>
        </nav>

        {/* Footer of the sidebar */}
        <div className="p-4 border-t border-zinc-800">
          <Link 
            href="/" 
            className="flex items-center text-sm text-zinc-400 hover:text-zinc-50 transition-colors"
          >
            &larr; Voltar para a Loja
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col w-full min-w-0">
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}