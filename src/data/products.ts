import shirt1 from "@/assets/shirt-1.jpg";
import shirt1Back from "@/assets/shirt-1-back.jpg";
import shirt1Detail from "@/assets/shirt-1-detail.jpg";
import shirt2 from "@/assets/shirt-2.jpg";
import shirt2Back from "@/assets/shirt-2-back.jpg";
import shirt2Detail from "@/assets/shirt-2-detail.jpg";
import shirt3 from "@/assets/shirt-3.jpg";
import shirt3Back from "@/assets/shirt-3-back.jpg";
import shirt3Detail from "@/assets/shirt-3-detail.jpg";
import shirt4 from "@/assets/shirt-4.jpg";
import shirt4Back from "@/assets/shirt-4-back.jpg";
import shirt4Detail from "@/assets/shirt-4-detail.jpg";

export type ProductPhoto = { src: string; label: string };

export type Product = {
  id: string;
  code: string;
  name: string;
  slug?: string;
  line: string;
  description: string;
  story: string;
  price: number;
  image: string;
  photos: ProductPhoto[];
  sizes: string[];
  specs: { label: string; value: string }[];
  highlights: string[];
  care: string[];
  tag?: string;
};

export const SIZES = ["PP", "P", "M", "G", "GG", "XG"];

const getSrc = (asset: unknown) =>
  typeof asset === "string" ? asset : (asset as { src: string }).src;

export const products: Product[] = [
  {
    id: "cerberus-oversized",
    code: "CBR-001",
    name: "Cerberus Oversized",
    slug: "cerberus-oversized",
    line: "Linha Guardiã",
    description:
      "Algodão pesado 240g, modelagem oversized e estampa serigráfica do Cerberus em laranja ember.",
    story:
      "A peça-símbolo da atlética. O brasão do Cerberus foi redesenhado em traço geométrico para a serigrafia, com camada dupla de tinta laranja que mantém a cor viva mesmo depois de dezenas de lavagens. Modelagem oversized com ombro caído, pensada para o dia de jogo e para a madrugada de código.",
    price: 129.9,
    image: getSrc(shirt1),
    photos: [
      { src: getSrc(shirt1), label: "Frente" },
      { src: getSrc(shirt1Back), label: "Costas" },
      { src: getSrc(shirt1Detail), label: "Detalhe da estampa" },
    ],
    sizes: SIZES,
    specs: [
      { label: "Tecido", value: "100% algodão penteado 240g" },
      { label: "Modelagem", value: "Oversized unissex, ombro caído" },
      { label: "Estampa", value: "Serigrafia em duas camadas" },
      { label: "Gola", value: "Ribana 2x1 reforçada" },
    ],
    highlights: [
      "Brasão do Cerberus em laranja ember",
      "Etiqueta interna emborrachada da atlética",
      "Barra reta com costura dupla",
    ],
    care: [
      "Lavar à mão ou em ciclo delicado até 30 °C",
      "Não passar ferro sobre a estampa",
      "Secar à sombra, do avesso",
    ],
    tag: "Mais vendida",
  },
  {
    id: "circuito-branca",
    code: "CBR-002",
    name: "Circuito Zero",
    slug: "circuito-branca",
    line: "Linha Bit",
    description:
      "Off-white com traçado de placa-mãe minimalista. Corte reto, gola dupla reforçada.",
    story:
      "Para quem prefere o discreto: um traçado de placa-mãe corre do ombro até a barra em laranja fino, quase um circuito real. É a camisa de todo dia, que combina com o jaleco do laboratório e com a fila do RU.",
    price: 109.9,
    image: getSrc(shirt2),
    photos: [
      { src: getSrc(shirt2), label: "Frente" },
      { src: getSrc(shirt2Back), label: "Costas" },
      { src: getSrc(shirt2Detail), label: "Detalhe da gola" },
    ],
    sizes: SIZES,
    specs: [
      { label: "Tecido", value: "100% algodão 190g off-white" },
      { label: "Modelagem", value: "Corte reto unissex" },
      { label: "Estampa", value: "Silk fino em linha contínua" },
      { label: "Gola", value: "Ribana dupla reforçada" },
    ],
    highlights: [
      "Traçado de circuito do ombro à barra",
      "Toque macio, ideal para uso diário",
      "Costura lateral sem emenda nas costas",
    ],
    care: [
      "Lavar separado nas primeiras lavagens",
      "Não usar alvejante",
      "Secar à sombra",
    ],
  },
  {
    id: "jersey-07",
    code: "CBR-003",
    name: "Jersey Submundo 07",
    slug: "jersey-07",
    line: "Linha Jogos",
    description:
      "Manga longa em dry-fit com faixas laranja e numeração personalizável nas costas.",
    story:
      "O uniforme das caravanas. Dry-fit leve que segura o suor nos jogos universitários, faixas laranja nas mangas e numeração grande nas costas — personalizável com o número e o apelido de guerra de cada atleta.",
    price: 179.9,
    image: getSrc(shirt3),
    photos: [
      { src: getSrc(shirt3), label: "Frente" },
      { src: getSrc(shirt3Back), label: "Costas · nº 07" },
      { src: getSrc(shirt3Detail), label: "Detalhe da manga" },
    ],
    sizes: SIZES,
    specs: [
      { label: "Tecido", value: "Poliamida dry-fit 165g" },
      { label: "Modelagem", value: "Atlética, manga longa raglan" },
      { label: "Estampa", value: "Sublimação total" },
      { label: "Extras", value: "Bolso com zíper na manga" },
    ],
    highlights: [
      "Numeração e nome personalizáveis",
      "Secagem rápida e proteção UV",
      "Faixas laranja nas duas mangas",
    ],
    care: [
      "Lavar do avesso em água fria",
      "Não usar amaciante",
      "Não secar em secadora",
    ],
    tag: "Edição limitada",
  },
  {
    id: "jersey-ember",
    code: "CBR-004",
    name: "Jersey Ember",
    slug: "jersey-ember",
    line: "Linha Jogos",
    description:
      "Uniforme oficial de competição em tecido respirável, painéis laterais pretos e grafismo tech.",
    story:
      "O manto oficial de competição. Painéis laterais pretos em malha perfurada dão ventilação onde o corpo mais esquenta, e o grafismo tech laranja é sublimado direto no tecido — sem peso, sem descascar.",
    price: 189.9,
    image: getSrc(shirt4),
    photos: [
      { src: getSrc(shirt4), label: "Frente" },
      { src: getSrc(shirt4Back), label: "Costas" },
      { src: getSrc(shirt4Detail), label: "Detalhe do painel" },
    ],
    sizes: SIZES,
    specs: [
      { label: "Tecido", value: "Poliéster técnico perfurado 150g" },
      { label: "Modelagem", value: "Slim atlética" },
      { label: "Estampa", value: "Sublimação total" },
      { label: "Gola", value: "Careca com acabamento preto" },
    ],
    highlights: [
      "Painéis laterais em malha respirável",
      "Costura flatlock antiatrito",
      "Peso reduzido para competição",
    ],
    care: [
      "Lavar do avesso em água fria",
      "Não passar ferro",
      "Secar à sombra",
    ],
  },
];

export const getProduct = (idOrSlug: string) =>
  products.find((p) => p.id === idOrSlug || p.slug === idOrSlug);

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
