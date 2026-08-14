"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";

/**
 * Instantly closes sales for an entire drop by setting its endsAt date to now.
 */
export async function closeDropSales(dropId: string) {
  await requireSession();

  await prisma.drop.update({
    where: { id: dropId },
    data: {
      endsAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/produtos");
}
