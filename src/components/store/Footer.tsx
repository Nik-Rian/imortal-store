import { Mail } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Logo className="h-14 w-auto" />
          <div>
            <p className="font-display text-sm font-bold tracking-[0.2em] uppercase">
              Atlética Imortal
            </p>
            <p className="mt-1 text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Engenharia de Computação
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-primary"
          >
            <InstagramIcon className="size-4" /> @atletica.imortal
          </a>
          <a
            href="mailto:contato@atleticaimortal.com"
            className="inline-flex items-center gap-2 transition-colors hover:text-primary"
          >
            <Mail className="size-4" /> contato@atleticaimortal.com
          </a>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
        © {new Date().getFullYear()} Atlética Imortal · Todos os direitos
        reservados
      </div>
    </footer>
  );
}
