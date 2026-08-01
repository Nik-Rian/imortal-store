import Link from "next/link";
import { getUsers } from "@/services/user.service";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlusIcon, ShieldIcon, UsersIcon } from "@phosphor-icons/react/ssr";

export default async function AdminUsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Usuários Admin</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as contas com permissão de acesso ao painel.
          </p>
        </div>
        <Button render={<Link href="/admin/usuarios/novo" />} size="sm">
          <UserPlusIcon className="mr-1.5 size-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden border-border/80 bg-surface">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-12 text-center">Avatar</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Função</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UsersIcon className="size-8 text-muted-foreground/50" />
                      <p>Nenhum usuário administrador cadastrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const initial = user.name
                    ? user.name.charAt(0).toUpperCase()
                    : user.email.charAt(0).toUpperCase();

                  return (
                    <TableRow key={user.id} className="transition-colors hover:bg-accent/40">
                      <TableCell className="text-center">
                        <Avatar className="mx-auto size-8 border border-border">
                          <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {user.name || "Administrador"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
                          <ShieldIcon className="size-3" />
                          <span>Admin</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteUserButton userId={user.id} userName={user.name || user.email} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


