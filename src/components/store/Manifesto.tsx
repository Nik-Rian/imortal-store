import { CpuIcon, FlameIcon, UsersIcon } from "@phosphor-icons/react";

const pillars = [
  {
    icon: FlameIcon,
    title: "Três cabeças",
    text: "Esporte, tecnologia e festa. O Imortal guarda os três portões do curso e não solta nenhum.",
  },
  {
    icon: CpuIcon,
    title: "Feito por quem compila",
    text: "Cada estampa nasce de um projeto autoral da diretoria de arte — nada de template genérico.",
  },
  {
    icon: UsersIcon,
    title: "Tudo volta pra base",
    text: "O lucro financia inscrições, uniformes e caravanas para os jogos universitários.",
  },
];


export function Manifesto() {
  return (
    <section
      id="manifesto"
      className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28"
    >
      <p className="text-kicker">Manifesto</p>
      <h2 className="leading-1.05 mt-3 max-w-3xl text-4xl font-bold uppercase sm:text-5xl">
        Do subsolo do laboratório para o{" "}
        <span className="text-primary">topo do pódio</span>
      </h2>

      <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
        {pillars.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-surface p-8">
            <span className="inline-flex size-11 items-center justify-center rounded-md border border-primary/40 text-primary">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-6 text-lg font-bold tracking-[0.06em] uppercase">
              {title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
