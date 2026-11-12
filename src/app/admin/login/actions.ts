"use server";

import { redirect } from "next/navigation";
import { checkAdminPassword, endAdminSession, startAdminSession } from "@/lib/auth";
import { str } from "@/lib/forms";
import type { FormState } from "@/lib/types";

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD не задан в переменных окружения." };
  const ok = await checkAdminPassword(str(fd, "password", 200));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slows down guessing
    return { error: "Неверный пароль." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}
