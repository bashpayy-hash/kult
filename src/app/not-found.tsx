import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="px-edge flex min-h-dvh flex-col">
      <header className="flex h-16 items-center md:h-20">
        <Logo />
      </header>
      <div className="flex flex-1 flex-col items-start justify-center gap-6 pb-24">
        <h1 className="text-[38px] md:text-[48px]">Страница не найдена</h1>
        <p className="text-ink-2">Бет табылмады. Проверьте ссылку или вернитесь на главную.</p>
        <Link href="/" className="btn btn-primary">
          На главную
        </Link>
      </div>
    </main>
  );
}
