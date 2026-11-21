"use server";

import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type ActionFailure = { success: false; error: string };
type ActionResult = { success: true } | ActionFailure;

export async function createAdminUser(
  formData: FormData,
): Promise<ActionFailure> {
  await requireSession();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { success: false, error: "Preencha nome, e-mail e senha." };
  }

  try {
    await auth.api.createUser({
      body: { email, password, name, role: "admin" },
      headers: await headers(),
    });
  } catch (error) {
    // better-auth reports expected failures (duplicate e-mail, weak password)
    // as APIError with a user-safe message; anything else is unexpected.
    if (error instanceof APIError) {
      return { success: false, error: error.message };
    }
    console.error("Erro ao criar usuário administrador:", error);
    return {
      success: false,
      error: "Não foi possível criar o usuário. Tente novamente.",
    };
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function deleteAdminUser(userId: string): Promise<ActionResult> {
  const session = await requireSession();

  if (session.user.id === userId) {
    return {
      success: false,
      error: "Você não pode remover seu próprio acesso.",
    };
  }

  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount <= 1) {
    return {
      success: false,
      error: "Não é possível remover o último usuário administrador.",
    };
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    console.error("Erro ao remover usuário administrador:", error);
    return {
      success: false,
      error: "Não foi possível remover o usuário. Tente novamente.",
    };
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}
