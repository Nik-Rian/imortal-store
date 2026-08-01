import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrderStatus } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  console.log("Initializing pooled database adapter...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Cleaning up existing data...");
  // Clean up dependent tables first to avoid foreign key constraint violations
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.drop.deleteMany();

  const now = new Date();

  console.log("Seeding Drops...");

  // 1. Active Drop
  const activeDrop = await prisma.drop.create({
    data: {
      name: "Drop 01 • Lançamento Imortal 2026",
      slug: "drop-01-2026",
      startsAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // Started 5 days ago
      endsAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000), // Ends in 25 days
    },
  });

  // 2. Upcoming Drop
  const upcomingDrop = await prisma.drop.create({
    data: {
      name: "Drop 02 • Edição InterAtléticas",
      slug: "drop-02-interatleticas",
      startsAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // Starts in 15 days
      endsAt: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000), // Ends in 45 days
    },
  });

  // 3. Past Drop
  const pastDrop = await prisma.drop.create({
    data: {
      name: "Drop 00 • Edição Fundadores 2025",
      slug: "drop-00-fundadores-2025",
      startsAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // Started 60 days ago
      endsAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Ended 30 days ago
    },
  });

  console.log("Seeding Products and Variants...");

  const apparelSizes = ["P", "M", "G", "GG", "XGG"];

  // Active Drop Products
  const product1 = await prisma.product.create({
    data: {
      code: "IMO-001",
      line: "ESSENTIALS",
      tag: "MAIS VENDIDO",
      name: "Camisa Imortal Classic Oversized (Preta)",
      slug: "camisa-imortal-classic-oversized-preta",
      description:
        "Modelagem streetwear oversized com caimento estruturado. Produzida em algodão 100% penteado 220g. Estampa em silk-screen de alta densidade no peito e costas com as cores da Atlética.",
      story:
        "Inspirada na cultura urbana e na força do espírito universitário, a Camisa Imortal Classic Oversized foi criada para traduzir a identidade da Atlética Imortal dentro e fora do campus.",
      priceCents: 8990, // R$ 89,90
      images: [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Composição", value: "100% Algodão Penteado" },
        { label: "Gramatura", value: "220 g/m²" },
        { label: "Modelagem", value: "Oversized Streetwear" },
        { label: "Estampa", value: "Silk-screen Alta Densidade" },
        { label: "Gola", value: "Ribana Canelada 3cm" },
      ],
      highlights: [
        "Algodão 100% penteado de alta gramatura (220g)",
        "Modelagem oversized estruturada com caimento streetwear",
        "Estampa em silk-screen de alta densidade no peito e costas",
        "Gola canelada de 3cm com reforço de ombro a ombro",
      ],
      care: [
        "Lavar à máquina em ciclo suave com água fria",
        "Não utilizar alvejantes ou cloro",
        "Secar no varal à sombra",
        "Passar do avesso em temperatura média (máx. 150°C)",
      ],
      sortOrder: 1,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product2 = await prisma.product.create({
    data: {
      code: "IMO-002",
      line: "HEAVYWEIGHT",
      tag: "DESTAQUE",
      name: "Moletom Canguru Imortal Heavyweight",
      slug: "moletom-canguru-imortal-heavyweight",
      description:
        "Moletom 3 cabos flanelado de altíssima gramatura (380g). Capuz duplo reforçado, bolso frontal estilo canguru e bordado de alta precisão no peito.",
      story:
        "Projetado para os dias mais frios e para quem exige o máximo de conforto e presença. Com malha 3 cabos de extrema densidade, este moletom une proteção térmica a uma estrutura imponente.",
      priceCents: 21990, // R$ 219,90
      images: [
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Composição", value: "50% Algodão / 50% Poliéster" },
        { label: "Gramatura", value: "380 g/m² (3 Cabos)" },
        { label: "Modelagem", value: "Boxy Fit Heavyweight" },
        { label: "Acabamento", value: "Bordado de Alta Precisão" },
        { label: "Capuz", value: "Duplo Forrado com Cordão Ajustável" },
      ],
      highlights: [
        "Malha 3 cabos flanelada de altíssima gramatura (380g)",
        "Capuz duplo reforçado com ponteiras metálicas nos cordões",
        "Bolso frontal no estilo canguru anatômico",
        "Bordado de alta definição Imortal no peito",
      ],
      care: [
        "Lavar preferencialmente à mão ou ciclo delicado",
        "Não utilizar secadora para preservar o encolhimento",
        "Não passar a ferro diretamente sobre o bordado",
        "Secar na horizontal à sombra",
      ],
      sortOrder: 2,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product3 = await prisma.product.create({
    data: {
      code: "IMO-003",
      line: "PERFORMANCE",
      tag: "EDIÇÃO ESPORTIVA",
      name: "Regata Atlética Imortal Dry-Fit",
      slug: "regata-atletica-imortal-dryfit",
      description:
        "Tecnologia Dry-Fit respirável com rápida evaporação de suor. Ideal para jogos, treinos e integrar a torcida nos eventos esportivos.",
      story:
        "Desenvolvida para alta performance nos jogos universitários e treinos intensos. Seu tecido de tecnologia avançada garante ventilação contínua e controle total da umidade corporal.",
      priceCents: 6990, // R$ 69,90
      images: [
        "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Composição", value: "100% Poliéster Microfibra" },
        { label: "Tecnologia", value: "Dry-Fit Evaporação Rápida" },
        { label: "Modelagem", value: "Athletic Fit (Corte Esportivo)" },
        { label: "Costuras", value: "Flatlock Anti-Atrito" },
      ],
      highlights: [
        "Tecnologia Dry-Fit respirável com secagem ultra-rápida",
        "Costuras anatômicas planas que reduzem o atrito com a pele",
        "Estampa em sublimação digital de altíssima durabilidade",
        "Cavas ampliadas para total liberdade de movimento",
      ],
      care: [
        "Lavar à máquina com água fria",
        "Não usar amaciante para manter a respirabilidade do tecido",
        "Não usar secadora",
        "Dispensa o uso de ferro de passar",
      ],
      sortOrder: 3,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product4 = await prisma.product.create({
    data: {
      code: "IMO-004",
      line: "ACCESSORIES",
      tag: "EDITION",
      name: "Boné Snapback Imortal Trucker",
      slug: "bone-snapback-imortal-trucker",
      description:
        "Boné modelo Trucker com tela respirável nas costas, fecho regulador snapback e patch frontal emborrachado com o escudo da Atlética.",
      story:
        "O modelo clássico trucker reinterpretado com a atitude Imortal. Tela traseira respirável e patch emborrachado 3D para destacar sua presença em qualquer ambiente.",
      priceCents: 5990, // R$ 59,90
      images: [
        "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Painel Frontal", value: "100% Sarja de Algodão" },
        { label: "Painel Traseiro", value: "100% Tela de Poliéster" },
        { label: "Fecho", value: "Snapback Regulável de Alta Resistência" },
        { label: "Aba", value: "Curva Moldável" },
      ],
      highlights: [
        "Modelo Trucker clássico com tela respirável nas costas",
        "Patch frontal emborrachado com o escudo Imortal em relevo 3D",
        "Fecho snapback regulável de encaixe preciso",
        "Fita interna acolchoada para absorção de suor",
      ],
      care: [
        "Limpar a seco ou com pano levemente úmido",
        "Não lavar na máquina nem submergir totalmente",
        "Secar à sombra em local arejado",
        "Guardar sem dobrar a aba ou deformar a copa",
      ],
      sortOrder: 4,
      dropId: activeDrop.id,
      variants: {
        create: [
          {
            size: "Único",
            sortOrder: 1,
          },
        ],
      },
    },
    include: { variants: true },
  });

  const product5 = await prisma.product.create({
    data: {
      code: "IMO-005",
      line: "EQUIPMENT",
      tag: "OFICIAL",
      name: "Caneca Alumínio 850ml com Tirante Imortal",
      slug: "caneca-aluminio-850ml-com-tirante-imortal",
      description:
        "Caneca oficial em alumínio reforçado com pintura eletrostática preta e estampa em serigrafia. Acompanha tirante acetinado exclusivo de 1,40m com mosquetão metálico.",
      story:
        "A companheira indispensável para eventos, festas e momentos de celebração. Fabricada em alumínio naval com pintura eletrostática de acabamento premium e tirante acetinado anatômico.",
      priceCents: 4990, // R$ 49,90
      images: [
        "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1588444839799-aea08566ef13?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Capacidade", value: "850 ml" },
        { label: "Material Caneca", value: "Alumínio Anodizado Reforçado" },
        { label: "Pintura", value: "Eletrostática Fosca Anti-Risco" },
        { label: "Tirante", value: "Fita Acetinada 35mm x 140cm com Mosquetão" },
      ],
      highlights: [
        "Alumínio térmico de alta resistência que mantém a bebida gelada",
        "Pintura eletrostática fosca ultra resistente a riscos",
        "Estampa em serigrafia de alta fixação",
        "Tirante de 1,40m em fita acetinada extra macia com mosquetão metálico",
      ],
      care: [
        "Lavar com o lado macio da esponja e detergente neutro",
        "Não utilizar palha de aço ou produtos abrasivos",
        "Não lavar na máquina lava-louças",
        "Remover o tirante antes de higienizar a caneca",
      ],
      sortOrder: 5,
      dropId: activeDrop.id,
      variants: {
        create: [
          {
            size: "Único",
            sortOrder: 1,
          },
        ],
      },
    },
    include: { variants: true },
  });

  // Upcoming Drop Product
  await prisma.product.create({
    data: {
      code: "IMO-006",
      line: "PERFORMANCE",
      tag: "EM BREVE",
      name: "Jaqueta Corta-Vento Imortal Tech",
      slug: "jaqueta-corta-vento-imortal-tech",
      description:
        "Tecido impermeável com forro interno em rede, capuz ajustável e zíper selado. Lançamento exclusivo para o próximo campeonato.",
      story:
        "Desenvolvida para proteger contra vento e chuva fina em deslocamentos e treinos ao ar livre. Design limpo e funcional com forro térmico respirável.",
      priceCents: 24990, // R$ 249,90
      images: [
        "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Composição Exterior", value: "100% Poliamida Resinada Impermeável" },
        { label: "Forro", value: "Mesh Respirável 100% Poliéster" },
        { label: "Bolsos", value: "2 Laterais e 1 Interno com Zíper Selado" },
        { label: "Ajuste", value: "Elásticos Reguláveis na Barra e Capuz" },
      ],
      highlights: [
        "Tecido corta-vento com tratamento hidro-repelente",
        "Forro interno em mesh que evita o acúmulo de umidade",
        "Zíperes com selamento resistente a água",
        "Capuz com reguladores elásticos embutidos",
      ],
      care: [
        "Lavar à mão com água fria e sabão neutro",
        "Não torcer ou usar secadora",
        "Não utilizar amaciante nem alvejantes",
        "Secar pendurado no cabide à sombra",
      ],
      sortOrder: 1,
      dropId: upcomingDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
  });

  // Past Drop Product
  await prisma.product.create({
    data: {
      code: "IMO-000",
      line: "HERITAGE",
      tag: "EDIÇÃO LIMITADA",
      name: "Camisa Edição Especial Fundadores (Branca)",
      slug: "camisa-edicao-especial-fundadores-branca",
      description:
        "Camisa comemorativa de fundação. Tecido premium de alta densidade com detalhes dourados bordados.",
      story:
        "Peça histórica comemorativa da fundação da Atlética. Produzida em lote numerado com detalhes artesanais bordados em fios dourados metálicos.",
      priceCents: 9990, // R$ 99,90
      images: [
        "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=800&auto=format&fit=crop&q=80",
      ],
      specs: [
        { label: "Composição", value: "100% Algodão Egípcio 200g" },
        { label: "Bordado", value: "Fios Dourados Lurex de Alta Densidade" },
        { label: "Modelagem", value: "Classic Heritage Fit" },
        { label: "Edição", "value": "Série Comemorativa Numerada" },
      ],
      highlights: [
        "Algodão egípcio de altíssima maciez e toque aveludado",
        "Bordados em fio dourado metálico no peito e manga",
        "Etiqueta comemorativa em cetim na barra",
        "Embalagem especial de colecionador inclusa",
      ],
      care: [
        "Lavar exclusivamente à mão em água fria",
        "Secar à sombra na horizontal",
        "Passar do avesso com ferro em temperatura baixa",
        "Não lavar a seco",
      ],
      sortOrder: 1,
      dropId: pastDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
  });

  console.log("Seeding Orders across all statuses...");

  // 1. Order Status: PENDING
  await prisma.order.create({
    data: {
      accessToken: "token_order_pending_1001",
      customerName: "Lucas Silva",
      customerEmail: "lucas.silva@gmail.com",
      customerPhone: "(85) 99123-4567",
      status: OrderStatus.PENDING,
      cancelableUntil: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
      totalPriceCents: 17980,
      items: {
        create: [
          {
            productId: product1.id,
            variantId: product1.variants.find((v) => v.size === "M")?.id,
            productName: product1.name,
            dropName: activeDrop.name,
            variantSize: "M",
            unitPriceCents: product1.priceCents,
            quantity: 2,
          },
        ],
      },
    },
  });

  // 2. Order Status: PAID
  await prisma.order.create({
    data: {
      accessToken: "token_order_paid_1002",
      customerName: "Mariana Costa",
      customerEmail: "mariana.costa@outlook.com",
      customerPhone: "(85) 98877-6655",
      status: OrderStatus.PAID,
      cancelableUntil: new Date(now.getTime() + 120 * 60 * 1000), // 2 hours from now
      totalPriceCents: 27980,
      items: {
        create: [
          {
            productId: product2.id,
            variantId: product2.variants.find((v) => v.size === "G")?.id,
            productName: product2.name,
            dropName: activeDrop.name,
            variantSize: "G",
            unitPriceCents: product2.priceCents,
            quantity: 1,
          },
          {
            productId: product4.id,
            variantId: product4.variants[0]?.id,
            productName: product4.name,
            dropName: activeDrop.name,
            variantSize: "Único",
            unitPriceCents: product4.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  // 3. Order Status: READY_FOR_PICKUP
  await prisma.order.create({
    data: {
      accessToken: "token_order_pickup_1003",
      customerName: "Gabriel Santos",
      customerEmail: "gabriel.santos@eng.ufc.br",
      customerPhone: "(85) 99654-3210",
      status: OrderStatus.READY_FOR_PICKUP,
      cancelableUntil: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Expired cancel window
      totalPriceCents: 16970,
      items: {
        create: [
          {
            productId: product3.id,
            variantId: product3.variants.find((v) => v.size === "GG")?.id,
            productName: product3.name,
            dropName: activeDrop.name,
            variantSize: "GG",
            unitPriceCents: product3.priceCents,
            quantity: 1,
          },
          {
            productId: product5.id,
            variantId: product5.variants[0]?.id,
            productName: product5.name,
            dropName: activeDrop.name,
            variantSize: "Único",
            unitPriceCents: product5.priceCents,
            quantity: 2,
          },
        ],
      },
    },
  });

  // 4. Order Status: COMPLETED
  await prisma.order.create({
    data: {
      accessToken: "token_order_completed_1004",
      customerName: "Beatriz Lima",
      customerEmail: "beatriz.lima@yahoo.com",
      customerPhone: "(85) 98765-4321",
      status: OrderStatus.COMPLETED,
      cancelableUntil: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      totalPriceCents: 8990,
      items: {
        create: [
          {
            productId: product1.id,
            variantId: product1.variants.find((v) => v.size === "P")?.id,
            productName: product1.name,
            dropName: activeDrop.name,
            variantSize: "P",
            unitPriceCents: product1.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  // 5. Order Status: CANCELLED
  await prisma.order.create({
    data: {
      accessToken: "token_order_cancelled_1005",
      customerName: "Pedro Henrique",
      customerEmail: "pedro.henrique@gmail.com",
      customerPhone: "(85) 99988-7766",
      status: OrderStatus.CANCELLED,
      cancelableUntil: new Date(now.getTime() - 10 * 60 * 1000),
      totalPriceCents: 6990,
      items: {
        create: [
          {
            productId: product3.id,
            variantId: product3.variants.find((v) => v.size === "M")?.id,
            productName: product3.name,
            dropName: activeDrop.name,
            variantSize: "M",
            unitPriceCents: product3.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  console.log("Seeding Admin User...");
  const { auth } = await import("../src/lib/auth");
  const adminEmail = "admin@imortalstore.com";

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingUser) {
    try {
      await auth.api.signUpEmail({
        body: {
          email: adminEmail,
          password: "adminpassword123",
          name: "Administrador Imortal",
        },
      });
      console.log(`Admin user created successfully!`);
      console.log(`E-mail: ${adminEmail} | Senha: adminpassword123`);
    } catch (error) {
      console.error("Error creating admin user:", error);
    }
  } else {
    console.log(`Admin user (${adminEmail}) already exists.`);
  }

  console.log("✅ Seed completed successfully!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
