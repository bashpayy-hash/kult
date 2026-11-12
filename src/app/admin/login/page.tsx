import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="px-edge flex min-h-dvh flex-col">
      <header className="flex h-16 items-center md:h-20">
        <Logo href="/admin/login" suffix="Админка" />
      </header>
      <div className="flex flex-1 items-center pb-24">
        <div className="w-full max-w-[26rem]">
          <h1 className="text-[38px]">Вход</h1>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
