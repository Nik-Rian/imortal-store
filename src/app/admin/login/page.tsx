"use client";

import { useState, type SyntheticEvent } from "react"; 
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    setIsLoading(false);

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-md border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Login administrativo</h1>
          <p className="text-sm text-zinc-500 mt-1">imortal-store</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">E-mail</label>
          <input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">Senha</label>
          <input id="password" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <button type="submit" disabled={isLoading}
          className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors disabled:opacity-50">
          {isLoading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}