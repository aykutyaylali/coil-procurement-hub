"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";
import { isLocale } from "@/lib/i18n";

export async function updateLocale(locale: string): Promise<void> {
  const user = await requireUser();
  if (!isLocale(locale)) return;
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
