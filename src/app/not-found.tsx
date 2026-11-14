import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Plate } from "@/components/Plate";
import { NOT_FOUND_COVER } from "@/lib/covers";

/**
 * 404 with Chick, the mascot, at work: she checks her phone and shrugs.
 * The text and the way home come first (on phones the plate goes under
 * them); the plate is decoration, so its alt stays empty. 14 Nov 2026:
 * «это всё сделай в дизайне, имплементни».
 */
export default function NotFound() {
  return (
    <main className="px-edge flex min-h-dvh flex-col">
      <header className="flex h-16 items-center md:h-20">
        <Logo />
      </header>
      <div className="grid flex-1 content-center items-center gap-10 pb-24 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-start gap-6">
          <h1 className="enter text-[38px] md:text-[48px]">Страница не найдена</h1>
          <p className="enter text-ink-2" style={{ ["--i" as string]: 1 }}>
            Бет табылмады. Проверьте ссылку или вернитесь на главную.
          </p>
          <Link href="/" className="enter btn btn-primary" style={{ ["--i" as string]: 2 }}>
            На главную
          </Link>
        </div>
        <div className="enter w-full max-w-[15rem] md:max-w-[22rem] md:justify-self-end" style={{ ["--i" as string]: 3 }}>
          <Plate
            src={NOT_FOUND_COVER.src}
            srcSet={NOT_FOUND_COVER.srcSet}
            sizes="(min-width: 768px) 22rem, 15rem"
            bg={NOT_FOUND_COVER.bg}
          />
        </div>
      </div>
    </main>
  );
}
