import { createAdminUser } from "@/actions/user.actions";

export default function NewAdminUserPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Novo Usuário</h1>
      <form action={createAdminUser} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">Nome</label>
          <input id="name" name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">E-mail</label>
          <input id="email" name="email" type="email" required className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">Senha temporária</label>
          <input id="password" name="password" type="password" required minLength={8} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>
        <button type="submit"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors">
          Criar Usuário
        </button>
      </form>
    </div>
  );
}