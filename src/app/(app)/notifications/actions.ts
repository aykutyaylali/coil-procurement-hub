"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
}

export async function markRead(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  revalidatePath("/notifications");
}
