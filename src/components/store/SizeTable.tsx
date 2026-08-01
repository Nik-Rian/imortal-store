const rows = [
  { size: "PP", chest: "48", length: "66" },
  { size: "P", chest: "51", length: "69" },
  { size: "M", chest: "54", length: "72" },
  { size: "G", chest: "57", length: "74" },
  { size: "GG", chest: "60", length: "76" },
  { size: "XG", chest: "63", length: "78" },
];

export function SizeTable() {
  return (
    <section id="tabela" className="border-y border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-kicker">Guia</p>
          <h2 className="mt-3 text-4xl font-bold uppercase sm:text-5xl">
            Tabela de tamanhos
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Medidas em centímetros, peça deitada. Modelagem unissex com caimento
            reto — para um visual oversized, escolha um tamanho acima.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-surface font-display text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                <th className="px-5 py-4 font-semibold">Tamanho</th>
                <th className="px-5 py-4 font-semibold">Largura</th>
                <th className="px-5 py-4 font-semibold">Comprimento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.size} className="border-t border-border">
                  <td className="px-5 py-3.5 font-display font-bold text-primary">
                    {r.size}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground tabular-nums">
                    {r.chest} cm
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground tabular-nums">
                    {r.length} cm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
