"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Não autenticado.");
  return session;
}

export async function createAdminUser(formData: FormData) {
  await requireSession();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    throw new Error("Missing required fields");
  }

  await auth.api.signUpEmail({ body: { email, password, name } });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function deleteAdminUser(userId: string) {
  const session = await requireSession();

  if (session.user.id === userId) {
    throw new Error("Você não pode remover seu próprio acesso.");
  }

  const userCount = await prisma.user.count();
  if (userCount <= 1) {
    throw new Error("Não é possível remover o último usuário administrador.");
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/usuarios");
}