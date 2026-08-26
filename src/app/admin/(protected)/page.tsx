import { getActiveDrop } from "@/services/drop.service";
import { SemesterLifecycleSlot } from "@/components/admin/SemesterLifecycleSlot";

export default async function AdminDashboardPage() {
  const activeDrop = await getActiveDrop();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Painel Administrativo
        </h1>
        <p className="mt-2 text-zinc-500">
          Bem-vindo ao gerenciamento da imortal-store.
        </p>
      </div>

      <SemesterLifecycleSlot activeDrop={activeDrop} />
    </div>
  );
}
