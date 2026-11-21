import { CreateAdminForm } from "@/components/admin/CreateAdminForm";

export default function NewAdminUserPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Novo Usuário</h1>
      <CreateAdminForm />
    </div>
  );
}
