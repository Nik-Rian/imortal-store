import Link from "next/link";
import { createAdminUser } from "@/actions/user.actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, UserPlusIcon } from "@phosphor-icons/react";

export default function NewAdminUserPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Novo Administrador</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre um novo usuário de acesso ao painel.
          </p>
        </div>
        <Button render={<Link href="/admin/usuarios" />} variant="outline" size="sm">
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Voltar
        </Button>
      </div>

      <Card className="border-border/80 bg-surface shadow-panel">
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold">Credenciais de Acesso</CardTitle>
          <CardDescription className="text-xs">
            Preencha os dados abaixo para criar a conta administrativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAdminUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="ex: Carlos Eduardo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail de Acesso</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="carlos@imortalstore.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha Temporária</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
              />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full">
                <UserPlusIcon className="mr-2 size-4" />
                Criar Usuário Administrador
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


