import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/Logo";
import heroBg from "@/assets/hero-bg.jpg";

export function Hero() {
  const heroImgSrc = typeof heroBg === "string" ? heroBg : heroBg.src;

  return (
    <section
      id="topo"
      className="relative overflow-hidden border-b border-border"
    >
      <img
        src={heroImgSrc}
        alt=""
        aria-hidden="true"
        width={1600}
        height={1008}
        className="absolute inset-0 size-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-background/70" />
      <div className="absolute inset-0 grid-veil" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-kicker">Loja oficial · Temporada 2026</p>
          <h1 className="leading-0.92 mt-5 font-display text-5xl font-bold uppercase sm:text-6xl lg:text-7xl">
            Vista o<span className="block text-primary">submundo</span>
            da computação
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            Camisas oficiais da Atlética Imortal. Três cabeças, um propósito:
            dominar a arena, o laboratório e a madrugada de código.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button variant="ember" size="xl" render={<a href="#colecao" />}>
              Ver coleção
            </Button>
            <Button variant="emberOutline" size="xl" render={<a href="#manifesto" />}>
              O manifesto
            </Button>
          </div>


          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
            {[
              ["4", "modelos"],
              ["PP–XG", "tamanhos"],
              ["3x", "sem juros"],
            ].map(([v, k]) => (
              <div key={k} className="bg-surface p-4">
                <dt className="font-display text-xl font-bold text-primary">
                  {v}
                </dt>
                <dd className="mt-1 text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                  {k}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto hidden w-full max-w-sm lg:block">
          <div className="border border-primary/30 bg-surface/60 p-10 shadow-panel clip-notch">
            <Logo className="mx-auto h-72 w-auto" />
            <p className="mt-6 text-center text-[0.7rem] tracking-[0.28em] text-muted-foreground uppercase">
              Guardiões do underground
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
